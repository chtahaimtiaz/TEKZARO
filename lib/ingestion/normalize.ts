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
