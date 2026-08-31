import type { KeywordType, PakistanImpactLevel } from "@prisma/client";

// Sensible baseline so relevance detection works before an editor has
// curated the Keyword table — the Keyword table (managed at /admin/keywords)
// only ever adds to this, never replaces it.
const BUILTIN_PAKISTAN_TERMS = [
  "pakistan", "pakistani", "islamabad", "karachi", "lahore", "rawalpindi",
  "peshawar", "quetta", "faisalabad", "multan", "pta", "state bank of pakistan",
  "sbp", "sindh", "punjab", "khyber pakhtunkhwa", "balochistan",
];

export interface RelevanceKeyword {
  term: string;
  type: KeywordType;
  priority: boolean;
}

export interface PakistanRelevanceResult {
  level: PakistanImpactLevel;
  score: number;
  reasons: string[];
}

function levelFromScore(score: number): PakistanImpactLevel {
  if (score >= 8) return "DIRECT";
  if (score >= 5) return "HIGH";
  if (score >= 3) return "MODERATE";
  if (score >= 1) return "LOW";
  return "NONE";
}

/**
 * Deterministic, keyword-based classification — deliberately not a
 * popularity/engagement signal, so a story merely trending in Pakistan can't
 * inflate this on its own. Every point is traceable to an actual matched
 * term, surfaced in `reasons` so an editor can see exactly why. Caller
 * should pass only *active* keywords (e.g. `Keyword.findMany({where:
 * {active: true}})`) — this function doesn't filter that itself.
 */
export function classifyPakistanRelevance(
  text: string,
  configuredKeywords: RelevanceKeyword[],
): PakistanRelevanceResult {
  const haystack = text.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  const matched = new Set<string>();

  for (const term of BUILTIN_PAKISTAN_TERMS) {
    if (haystack.includes(term) && !matched.has(term)) {
      matched.add(term);
      score += 3;
      reasons.push(`Mentions "${term}"`);
    }
  }

  for (const kw of configuredKeywords) {
    const termLower = kw.term.toLowerCase();
    if (matched.has(termLower) || !haystack.includes(termLower)) continue;
    matched.add(termLower);
    const base = kw.type === "PAKISTAN" ? 3 : 2;
    const points = kw.priority ? base + 2 : base;
    score += points;
    reasons.push(`Matches configured ${kw.type.toLowerCase()} keyword "${kw.term}"${kw.priority ? " (priority)" : ""}`);
  }

  return { level: levelFromScore(score), score, reasons };
}

/** Maps the raw keyword-match score onto the app-wide 0-100
 * `pakistanRelevance` scale used by Article/SourceItem/StoryCluster. */
export function relevanceScoreToPercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 10)));
}
