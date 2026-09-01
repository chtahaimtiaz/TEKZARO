import { titleSimilarity, normalizeUrlForDedup } from "../ingestion/normalize";

export const AUTO_MERGE_THRESHOLD = 0.72;
export const POSSIBLE_DUPLICATE_THRESHOLD = 0.45;

export interface DuplicateCandidate {
  id: string;
  clusterId: string | null;
  sourceUrl: string;
  canonicalUrl: string | null;
  normalizedTitle: string;
  sourceId: string;
  publishedAt: Date | null;
}

export interface DuplicateMatch {
  candidate: DuplicateCandidate;
  score: number;
  reason: string;
}

/**
 * Compares a new item against recent candidates. Exact canonical/source URL
 * match scores 1.0. Otherwise, normalized-title token overlap (Jaccard),
 * with a small same-source-domain / near-in-time boost — never enough on
 * its own to reach AUTO_MERGE_THRESHOLD, since two different stories from
 * the same outlet on the same day shouldn't auto-merge. Returns the single
 * best match, or null if nothing clears POSSIBLE_DUPLICATE_THRESHOLD.
 */
export function findBestDuplicateMatch(
  incoming: { sourceUrl: string; canonicalUrl?: string | null; normalizedTitle: string; sourceId: string; publishedAt: Date | null },
  candidates: DuplicateCandidate[],
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;

  const incomingUrl = normalizeUrlForDedup(incoming.sourceUrl);
  const incomingCanonical = incoming.canonicalUrl ? normalizeUrlForDedup(incoming.canonicalUrl) : null;

  for (const candidate of candidates) {
    if (incomingCanonical && candidate.canonicalUrl && incomingCanonical === normalizeUrlForDedup(candidate.canonicalUrl)) {
      return { candidate, score: 1, reason: "Exact canonical URL match" };
    }
    if (incomingUrl === normalizeUrlForDedup(candidate.sourceUrl)) {
      return { candidate, score: 1, reason: "Exact source URL match" };
    }

    let score = titleSimilarity(incoming.normalizedTitle, candidate.normalizedTitle);
    const reasons: string[] = [`Title similarity ${(score * 100).toFixed(0)}%`];

    if (incoming.publishedAt && candidate.publishedAt) {
      const hoursApart = Math.abs(incoming.publishedAt.getTime() - candidate.publishedAt.getTime()) / 36e5;
      if (hoursApart <= 48 && score > 0.2) {
        score += 0.08;
        reasons.push("published within 48h of each other");
      }
    }
    if (incoming.sourceId !== candidate.sourceId && score > 0.2) {
      score += 0.05;
      reasons.push("reported by a different source (corroboration signal)");
    }

    score = Math.min(1, score);
    if (score >= POSSIBLE_DUPLICATE_THRESHOLD && (!best || score > best.score)) {
      best = { candidate, score, reason: reasons.join(", ") };
    }
  }

  return best;
}
