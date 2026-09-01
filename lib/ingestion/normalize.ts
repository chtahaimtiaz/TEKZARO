const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for",
  "with", "at", "by", "from", "is", "are", "was", "were", "be", "as", "it",
  "its", "this", "that", "new", "says", "after", "over",
]);

/** Lowercased, punctuation-stripped, stopword-filtered — used for
 * title-similarity comparisons, not for display. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .sort()
    .join(" ");
}

export function titleTokens(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

/** Jaccard similarity between two already-normalized titles' token sets. */
export function titleSimilarity(a: string, b: string): number {
  const setA = titleTokens(a);
  const setB = titleTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_NAMES = new Set(["fbclid", "gclid", "ref", "igshid", "mc_cid", "mc_eid"]);

/**
 * Canonicalizes a URL for duplicate-comparison purposes only — strips
 * tracking query params so the same story syndicated with different
 * ?utm_source=/fbclid=/etc. still hits lib/discovery/duplicates.ts's exact
 * URL match (its strongest, most confident signal) instead of falling
 * through to the weaker title-similarity fallback. Never used for storage:
 * SourceItem.sourceUrl always keeps the real, original URL for provenance.
 * Malformed input returns the original string unchanged rather than
 * throwing — comparison degrades gracefully, it never blocks ingestion.
 */
export function normalizeUrlForDedup(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAM_NAMES.has(lower) || TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = "";
    let result = parsed.toString();
    if (result.endsWith("/") && parsed.pathname !== "/") result = result.slice(0, -1);
    return result;
  } catch {
    return url;
  }
}
