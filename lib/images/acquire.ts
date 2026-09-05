import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import { safeFetch, safeFetchBinary } from "../security/safe-fetch";
import { isFetchAllowed } from "../ingestion/robots";
import { getSystemUserId } from "../system-actor";
import { saveUpload } from "../media/storage";
import { extractImageCandidates, type ImageCandidate } from "./extract";
import { rankImageCandidates } from "./filter-rank";
import { evaluateReuseStatus } from "./rights";
import { sniffImage, type SniffedImage } from "./sniff";
import { recordAcquisitionOutcome } from "./metrics";
import type { Prisma, ImageReuseStatus } from "@prisma/client";

const MIME_BY_FORMAT: Record<SniffedImage["format"], string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
const EXT_BY_FORMAT: Record<SniffedImage["format"], string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
};

export interface AcquisitionResult {
  ok: boolean;
  /** Structured, countable classification of how this attempt ended. */
  outcome?: AcquisitionOutcome;
  mediaId?: string;
  reason?: string;
  /** Set whenever ok:true — lets callers (e.g. the hourly ingestion cron
   * summary) tally how many acquired images are actually publishable vs.
   * awaiting editorial review, without a second query. */
  reuseStatus?: ImageReuseStatus;
}

interface CandidateAuditEntry {
  url: string;
  metadataSource: string;
  score: number;
  reasons: string[];
  selected: boolean;
  rejected?: string;
}

export interface AcquireImageInput {
  id: string;
  sourceUrl: string;
  headline: string;
  /** SourceItem.imageUrl — the image the publisher put in their own RSS
   * enclosure/media:content at ingestion time. Optional so existing callers
   * and tests keep working, but passing it is what makes acquisition work
   * for the ~78% of articles whose page cannot be fetched (403 or
   * robots.txt), because it needs no access to the article page at all. */
  feedImageUrl?: string | null;
}

/** One structured outcome per acquisition attempt, for the metrics in
 * lib/images/metrics.ts. Kept as a discriminated string rather than free
 * text so failures can actually be counted and compared over time — the
 * previous free-form `reason` string could only be read by a human. */
export type AcquisitionOutcome =
  | "ATTACHED"
  | "DEDUPED"
  | "NO_CANDIDATES"
  | "PAGE_BLOCKED_NO_FEED_IMAGE"
  | "ALL_CANDIDATES_FAILED"
  | "ERROR";


/** Turns SourceItem.imageUrl into a ranked-candidate input. Returns an
 * empty list rather than throwing on a malformed or non-http(s) URL, so a
 * bad feed value degrades to "no feed candidate" instead of failing the
 * whole acquisition. */
function buildFeedCandidate(item: AcquireImageInput): ImageCandidate[] {
  const raw = item.feedImageUrl?.trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return [];
    return [
      {
        sourceUrl: url.toString(),
        sourceArticleUrl: item.sourceUrl,
        sourceDomain: new URL(item.sourceUrl).hostname,
        altText: item.headline,
        metadataSource: "feed",
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Finds, downloads, and stores the best usable featured image for a
 * discovery source item, or honestly finds nothing — never throws, and
 * never fails article import over an image problem (callers must not let a
 * rejected promise from this function propagate into anything that would
 * abort ingestion; the try/catch below is defense-in-depth on top of that,
 * not a substitute for it).
 *
 * Every candidate considered — not just the winner — is recorded on
 * SourceItem.rawMetadata.imageCandidates as an audit trail, so an editor
 * (or a future debugging session) can see exactly why an image was or
 * wasn't selected.
 *
 * Public accessibility is never treated as reuse permission here: the
 * `reuseStatus` this function assigns is either the narrow, explicit
 * LICENSED grant from lib/images/rights.ts, or REQUIRES_REVIEW — nothing
 * this function does can ever produce ALLOWED/OWNED/GENERATED for a scraped
 * third-party image. See the Non-negotiable invariant in the
 * image-acquisition plan.
 */
export async function acquireImageForSourceItem(item: AcquireImageInput): Promise<AcquisitionResult> {
  const audit: CandidateAuditEntry[] = [];

  try {
    // The publisher's own feed image is gathered first and never depends on
    // reaching the article page. This ordering is the whole fix: the old
    // flow returned early whenever robots.txt disallowed the page or the
    // page 403'd, which is what happens to roughly 78% of items, so no
    // image was ever acquired for them even when the feed had already
    // handed us one.
    const feedCandidates = buildFeedCandidate(item);

    let pageHtml: string | null = null;
    let pageBlockedReason: string | null = null;

    if (await isFetchAllowed(item.sourceUrl)) {
      const page = await safeFetch(item.sourceUrl).catch(() => null);
      if (page && page.status === 200) pageHtml = page.text;
      else pageBlockedReason = page ? `article page returned HTTP ${page.status}` : "article page fetch failed";
    } else {
      pageBlockedReason = "robots.txt disallows fetching the article page";
    }

    const pageCandidates = pageHtml ? extractImageCandidates(pageHtml, item.sourceUrl) : [];
    const ranked = rankImageCandidates([...feedCandidates, ...pageCandidates]);

    if (ranked.length === 0) {
      return await finish({
        ok: false,
        outcome: pageHtml ? "NO_CANDIDATES" : "PAGE_BLOCKED_NO_FEED_IMAGE",
        reason: pageHtml
          ? "No usable image candidates found on the source page"
          : `No image in the publisher's feed and ${pageBlockedReason} — nothing to acquire`,
      });
    }

    // Rights can only be read from the article page. When it is unreachable
    // there is no grant to find, so this stays REQUIRES_REVIEW — the honest
    // answer, never an invented licence. featuredImageFieldsFor keeps
    // REQUIRES_REVIEW images out of featuredImageUrl, so nothing uncleared
    // renders publicly regardless.
    const rights = pageHtml
      ? evaluateReuseStatus(pageHtml)
      : {
          status: "REQUIRES_REVIEW" as const,
          notes: `Article page could not be read (${pageBlockedReason}), so no reuse grant could be evaluated. Image came from the publisher's own syndication feed. An editor must clear it before publication.`,
        };

    // A non-CC page still yields a stored image, marked REQUIRES_REVIEW for
    // an editor to clear — featuredImageFieldsFor deliberately sets
    // featuredMediaId (so the editor sees "found, needs review") while
    // leaving featuredImageUrl null, so nothing uncleared can render
    // publicly. Blocking storage here instead starved that review queue and
    // left every new article with no image at all.
    //
    // What actually filled the blob store was volume, not review-pending
    // status: acquisition ran for every ingested item (~1,900/day), and of
    // 1,999 stored images 1,975 were attached to no article. That is fixed
    // by acquiring lazily instead — see featuredImageFieldsFor, which runs
    // acquisition only once an item genuinely becomes an article.

    for (const { candidate, score, reasons } of ranked) {
      const entry: CandidateAuditEntry = {
        url: candidate.sourceUrl,
        metadataSource: candidate.metadataSource,
        score,
        reasons,
        selected: false,
      };
      audit.push(entry);

      try {
        const downloaded = await safeFetchBinary(candidate.sourceUrl);
        if (downloaded.status !== 200) {
          entry.rejected = `Download returned HTTP ${downloaded.status}`;
          continue;
        }

        const sniffed = sniffImage(downloaded.bytes);
        if (!sniffed) {
          entry.rejected = "Downloaded content is not a recognized JPEG/PNG/WEBP/GIF image";
          continue;
        }

        const contentHash = createHash("sha256").update(downloaded.bytes).digest("hex");

        const existing = await prisma.media.findUnique({ where: { contentHash } });
        if (existing) {
          if (!existing.sourceItemId) {
            await prisma.media.update({ where: { id: existing.id }, data: { sourceItemId: item.id } });
          }
          entry.selected = true;
          return await finish({ ok: true, outcome: "DEDUPED", mediaId: existing.id, reuseStatus: existing.reuseStatus });
        }

        const mimeType = MIME_BY_FORMAT[sniffed.format];
        const ext = EXT_BY_FORMAT[sniffed.format];
        const filename = `${contentHash.slice(0, 16)}.${ext}`;
        // Buffer's .buffer is typed ArrayBufferLike (could be a
        // SharedArrayBuffer), which File's BlobPart doesn't accept — copy
        // into a plain Uint8Array backed by a real ArrayBuffer.
        const file = new File([new Uint8Array(downloaded.bytes)], filename, { type: mimeType });

        const saved = await saveUpload(file, "article");
        const systemUserId = await getSystemUserId();

        const media = await prisma.media.create({
          data: {
            url: saved.url,
            altText: candidate.altText || item.headline,
            filename,
            mimeType,
            sizeBytes: downloaded.bytes.length,
            width: sniffed.width ?? candidate.width,
            height: sniffed.height ?? candidate.height,
            uploadedById: systemUserId,
            sourceItemId: item.id,
            sourceUrl: candidate.sourceUrl,
            sourceArticleUrl: candidate.sourceArticleUrl,
            sourceDomain: candidate.sourceDomain,
            contentHash,
            reuseStatus: rights.status,
            reuseNotes: rights.notes,
            selectionScore: score,
            selectionReasons: reasons as unknown as Prisma.InputJsonValue,
          },
        });

        entry.selected = true;
        return await finish({ ok: true, outcome: "ATTACHED", mediaId: media.id, reuseStatus: media.reuseStatus });
      } catch (err) {
        entry.rejected = err instanceof Error ? err.message : String(err);
      }
    }

    return await finish({ ok: false, outcome: "ALL_CANDIDATES_FAILED", reason: "All candidates failed to download or store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, outcome: "ERROR", reason: message };
  }

  async function finish(result: AcquisitionResult): Promise<AcquisitionResult> {
    await prisma.sourceItem
      .update({
        where: { id: item.id },
        data: { rawMetadata: { imageCandidates: audit } as unknown as Prisma.InputJsonValue },
      })
      .catch(() => {});

    const selected = audit.find((a) => a.selected);
    await recordAcquisitionOutcome({
      outcome: result.outcome ?? (result.ok ? "ATTACHED" : "ERROR"),
      sourceItemId: item.id,
      sourceDomain: (() => {
        try {
          return new URL(item.sourceUrl).hostname;
        } catch {
          return null;
        }
      })(),
      candidateUrl: selected?.url ?? null,
      reason: result.reason ?? null,
    });

    return result;
  }
}
