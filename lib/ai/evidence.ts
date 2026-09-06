import "server-only";
import { safeFetch } from "../security/safe-fetch";
import { isFetchAllowed } from "../ingestion/robots";
import { extractArticle } from "./article-extract";
import { classifySource, SourceRank, rankName, isPrimaryRank, isCorroboratingRank } from "./source-classification";

/**
 * Builds the evidence bundle handed to the editorial model.
 *
 * Previously the model received up to two pages, flattened to tag-stripped
 * text and concatenated. Nothing distinguished a regulator's filing from a
 * blog post, no publication date or author survived, and boilerplate
 * competed with the article for the character budget. Articles landed at
 * 400-470 words not because the model was unwilling to write more, but
 * because it genuinely had little to write from.
 *
 * Documents are kept separate and labelled so the model can attribute each
 * claim to the right source and report disagreement between them.
 */

export interface EvidenceDocument {
  url: string;
  hostname: string;
  rank: SourceRank;
  rankLabel: string;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  text: string;
  /** Whether this is the outlet whose feed surfaced the story. That outlet's
   * own report is real evidence, but it is the thing being verified, so it
   * can never corroborate itself. */
  isOriginatingOutlet: boolean;
}

/** How much material the model actually has. Drives article ambition — see
 * the editorial standard's rule that length is a ceiling evidence must earn. */
export type EvidenceRichness = "THIN" | "MODERATE" | "RICH" | "VERY_RICH";

export interface EvidenceBundle {
  documents: EvidenceDocument[];
  richness: EvidenceRichness;
  totalChars: number;
  /** The highest-ranked document that is genuinely primary, if any. Only this
   * can support PRIMARY_SOURCE_CONFIRMED. */
  primary: EvidenceDocument | null;
  /** An independent document from a different host that corroborates. */
  corroborating: EvidenceDocument | null;
  /** Why candidates were rejected, for the audit trail. */
  notes: string[];
}

/** Total characters of evidence given to the model. Raised from 6,000 with
 * extraction in place: that budget used to be spent largely on navigation
 * and cookie banners, so more of it now reaches the article body. */
export const MAX_EVIDENCE_CHARS = 24000;
/** Per-document ceiling, so one long feature cannot crowd out a second
 * source that would otherwise let the model reconcile two accounts. */
const MAX_DOC_CHARS = 10000;
/** Below this a fetch has not produced usable reporting — a paywall
 * interstitial or a consent wall rather than an article. */
const MIN_DOC_CHARS = 600;

async function fetchAndExtract(url: string, isOriginating: boolean): Promise<EvidenceDocument | { error: string }> {
  const classification = classifySource(url);
  if (classification.rank === SourceRank.AGGREGATOR) {
    return { error: `${classification.hostname}: aggregator, skipped` };
  }
  try {
    if (!(await isFetchAllowed(url))) return { error: `${classification.hostname}: robots.txt disallows` };
    const page = await safeFetch(url);
    if (page.status !== 200) return { error: `${classification.hostname}: HTTP ${page.status}` };

    const article = extractArticle(page.text, url);
    if (article.length < MIN_DOC_CHARS) {
      return { error: `${classification.hostname}: only ${article.length} chars recovered` };
    }
    return {
      url: article.canonicalUrl ?? url,
      hostname: classification.hostname,
      rank: classification.rank,
      rankLabel: classification.label,
      title: article.title,
      author: article.author,
      publishedAt: article.publishedAt,
      text: article.text.slice(0, MAX_DOC_CHARS),
      isOriginatingOutlet: isOriginating,
    };
  } catch (err) {
    return { error: `${classification.hostname}: ${err instanceof Error ? err.message.slice(0, 60) : "fetch failed"}` };
  }
}

function classifyRichness(docs: EvidenceDocument[], totalChars: number): EvidenceRichness {
  if (docs.length === 0 || totalChars < 800) return "THIN";
  const hasPrimary = docs.some((d) => isPrimaryRank(d.rank));
  if (docs.length >= 2 && hasPrimary && totalChars >= 6000) return "VERY_RICH";
  if (totalChars >= 6000 || (docs.length >= 2 && totalChars >= 3000)) return "RICH";
  if (totalChars >= 1500) return "MODERATE";
  return "THIN";
}

/**
 * Gathers evidence for one story.
 *
 * Candidates are tried in descending evidentiary weight rather than search
 * order, and the originating outlet's own article is always attempted — it is
 * the most reliably fetchable document available and was previously ignored
 * entirely, even though the image pipeline already fetches the same page.
 */
export async function gatherEvidence(params: {
  originatingUrl: string;
  searchResults: { title: string; url: string; snippet: string }[];
  /** Cap on pages fetched, so a routine story does not trigger expensive
   * multi-source retrieval. */
  maxDocuments?: number;
}): Promise<EvidenceBundle> {
  const { originatingUrl, searchResults } = params;
  const maxDocuments = params.maxDocuments ?? 3;
  const notes: string[] = [];
  const documents: EvidenceDocument[] = [];
  const seenHosts = new Set<string>();

  const originHost = classifySource(originatingUrl).hostname;

  // Rank candidates by evidentiary weight, not by search position. Drop
  // aggregators and anything on a host already represented.
  const candidates = searchResults
    .map((r) => ({ url: r.url, cls: classifySource(r.url) }))
    .filter((c) => c.cls.rank !== SourceRank.AGGREGATOR)
    .sort((a, b) => a.cls.rank - b.cls.rank);

  // The originating outlet first: it is what the story is, and it is nearly
  // always reachable.
  const origin = await fetchAndExtract(originatingUrl, true);
  if ("error" in origin) notes.push(`originating outlet — ${origin.error}`);
  else {
    documents.push(origin);
    seenHosts.add(origin.hostname);
  }

  for (const c of candidates) {
    if (documents.length >= maxDocuments) break;
    if (seenHosts.has(c.cls.hostname) || c.cls.hostname === originHost) continue;
    const doc = await fetchAndExtract(c.url, false);
    if ("error" in doc) {
      notes.push(doc.error);
      continue;
    }
    documents.push(doc);
    seenHosts.add(doc.hostname);
  }

  // Trim to the overall budget, keeping the highest-weighted documents whole.
  documents.sort((a, b) => a.rank - b.rank);
  let running = 0;
  const kept: EvidenceDocument[] = [];
  for (const d of documents) {
    if (running + d.text.length > MAX_EVIDENCE_CHARS) {
      const room = MAX_EVIDENCE_CHARS - running;
      if (room < MIN_DOC_CHARS) break;
      kept.push({ ...d, text: d.text.slice(0, room) });
      running += room;
      break;
    }
    kept.push(d);
    running += d.text.length;
  }

  const primary = kept.find((d) => isPrimaryRank(d.rank) && !d.isOriginatingOutlet) ?? null;
  const corroborating =
    kept.find((d) => !d.isOriginatingOutlet && d !== primary && isCorroboratingRank(d.rank)) ?? null;

  return {
    documents: kept,
    richness: classifyRichness(kept, running),
    totalChars: running,
    primary,
    corroborating,
    notes,
  };
}

/** Renders the bundle for the prompt. Each document keeps its own header so
 * the model can attribute claims and surface disagreement rather than
 * blending sources into one undifferentiated account. */
export function formatEvidence(bundle: EvidenceBundle): string {
  if (bundle.documents.length === 0) {
    return "No source material could be retrieved for this story. Write only from the discovered headline and summary above, or return draft: null if that is not enough.";
  }
  const parts = bundle.documents.map((d, i) => {
    const header = [
      `SOURCE ${i + 1} — ${rankName(d.rank).toUpperCase()}${d.isOriginatingOutlet ? " (the outlet that reported this story; it cannot corroborate itself)" : ""}`,
      `Publication: ${d.hostname}${d.author ? ` — by ${d.author}` : ""}`,
      d.publishedAt ? `Published: ${d.publishedAt}` : null,
      `URL: ${d.url}`,
      d.title ? `Headline: ${d.title}` : null,
      `Weight: ${d.rankLabel}`,
    ]
      .filter(Boolean)
      .join("\n");
    return `${header}\n---\n${d.text}`;
  });

  const guidance =
    bundle.richness === "THIN"
      ? "EVIDENCE IS THIN. Write a short, honest article. Do not extend it with material these sources do not contain."
      : bundle.richness === "MODERATE"
        ? "EVIDENCE IS MODERATE. A medium-depth article is appropriate."
        : bundle.richness === "RICH"
          ? "EVIDENCE IS SUBSTANTIAL. A detailed article is appropriate where the material genuinely supports it."
          : "EVIDENCE IS STRONG, including primary-source material. A comprehensive article is appropriate where the material genuinely supports it.";

  return `${guidance}\n\nWhere these sources disagree on a fact, report the disagreement and attribute each account rather than silently choosing one.\n\n${parts.join("\n\n=====\n\n")}`;
}
