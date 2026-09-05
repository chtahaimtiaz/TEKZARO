import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import { safeFetch, safeFetchBinary } from "../security/safe-fetch";
import { isFetchAllowed } from "../ingestion/robots";
import { getSystemUserId } from "../system-actor";
import { saveUpload } from "../media/storage";
import { extractImageCandidates } from "./extract";
import { rankImageCandidates } from "./filter-rank";
import { evaluateReuseStatus } from "./rights";
import { sniffImage, type SniffedImage } from "./sniff";
import type { Prisma, ImageReuseStatus } from "@prisma/client";
import { isPublishableReuseStatus } from "../publication-checks";

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
    const allowed = await isFetchAllowed(item.sourceUrl);
    if (!allowed) {
      return await finish({ ok: false, reason: "robots.txt disallows fetching this article page" });
    }

    const page = await safeFetch(item.sourceUrl);
    if (page.status !== 200) {
      return await finish({ ok: false, reason: `Article page returned HTTP ${page.status}` });
    }

    const ranked = rankImageCandidates(extractImageCandidates(page.text, item.sourceUrl));
    if (ranked.length === 0) {
      return await finish({ ok: false, reason: "No usable image candidates found on the source page" });
    }

    const rights = evaluateReuseStatus(page.text);

    // Nothing is downloaded or stored unless the licence actually permits
    // reuse. Rights are known from the source page before any candidate is
    // fetched, so a page we could never publish from costs no bandwidth and
    // no storage.
    //
    // This previously stored every candidate regardless, marking non-CC
    // ones REQUIRES_REVIEW for an editor to approve later. In practice that
    // filled the blob store with material that could not be used: of 1,999
    // stored images, 1,884 were REQUIRES_REVIEW and 1,975 were attached to
    // no article at all — 98.8% waste, at roughly 359 new files a day,
    // which is what suspended the store and broke every image on the site.
    // An editor can still upload an image by hand; what is removed is the
    // automatic hoarding of images the licence forbids us from publishing.
    // isPublishableReuseStatus is the same predicate the publication gate
    // uses, so "worth storing" and "allowed to publish" can never drift
    // apart into storing things that could never ship.
    if (!isPublishableReuseStatus(rights.status)) {
      return await finish({
        ok: false,
        reason: `Source page licence does not permit reuse (${rights.status}) — no image stored. ${rights.notes ?? ""}`.trim(),
      });
    }

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
          return await finish({ ok: true, mediaId: existing.id, reuseStatus: existing.reuseStatus });
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
        return await finish({ ok: true, mediaId: media.id, reuseStatus: media.reuseStatus });
      } catch (err) {
        entry.rejected = err instanceof Error ? err.message : String(err);
      }
    }

    return await finish({ ok: false, reason: "All candidates failed to download or store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }

  async function finish(result: AcquisitionResult): Promise<AcquisitionResult> {
    await prisma.sourceItem
      .update({
        where: { id: item.id },
        data: { rawMetadata: { imageCandidates: audit } as unknown as Prisma.InputJsonValue },
      })
      .catch(() => {});
    return result;
  }
}
