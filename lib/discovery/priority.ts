import type { SourceTier } from "@prisma/client";
import type { TechRelevanceResult } from "./tech-relevance";

const BREAKING_SIGNALS = ["breaking", "urgent", "just in", "alert", "live updates"];

// TEKZARO is a technology publication — an item with zero matched
// technology signal (see lib/discovery/tech-relevance.ts) is heavily
// deprioritized, not silently dropped: this is deprioritization, not
// rejection, matching how every other signal in this pipeline (duplicates,
// Pakistan-relevance) stays transparent and editor-overridable rather than
// a hard gate. Sized against the rest of this scale (tier max 30, recency
// max 25, Pakistan max 20, corroboration max 24, breaking +15,
// priority-keywords max 20 — realistic totals run roughly 0-130) so an
// off-topic item reliably sinks below genuine tech stories; a resulting
// negative priorityScore still sorts correctly to the bottom of
// /admin/discovery and stays fully visible/reviewable there.
const NON_TECH_PENALTY = 45;

const TIER_POINTS: Record<SourceTier, number> = {
  TIER_1: 30,
  TIER_2: 15,
  TIER_3: 5,
};

const TIER_LABELS: Record<SourceTier, string> = {
  TIER_1: "Tier 1 source",
  TIER_2: "Tier 2 source",
  TIER_3: "Tier 3 source",
};

export interface PriorityInput {
  sourceTier: SourceTier;
  publishedAt: Date | null;
  pakistanRelevance: number; // 0-100
  corroboratingSourceCount: number; // other items already in the same cluster
  headline: string;
  matchedPriorityKeywords: string[];
  techRelevance: TechRelevanceResult;
}

export interface PriorityResult {
  score: number;
  reasons: string[];
}

function recencyPoints(publishedAt: Date | null): { points: number; reason?: string } {
  if (!publishedAt) return { points: 0 };
  const hoursAgo = (Date.now() - publishedAt.getTime()) / 36e5;
  if (hoursAgo < 0) return { points: 0 };
  const points = Math.max(0, 25 - hoursAgo * 0.6);
  if (points < 3) return { points: 0 };
  return { points, reason: hoursAgo < 3 ? "Published within the last 3 hours" : "Recently published" };
}

/**
 * Transparent, additive score — every point traces back to a plain-English
 * reason that's what the discovery UI actually shows, not the raw number.
 * No AI/opaque model involved; editors can audit and disagree with it.
 */
export function computePriorityScore(input: PriorityInput): PriorityResult {
  const reasons: string[] = [];
  let score = 0;

  score += TIER_POINTS[input.sourceTier];
  reasons.push(TIER_LABELS[input.sourceTier]);

  const recency = recencyPoints(input.publishedAt);
  if (recency.points > 0) {
    score += recency.points;
    if (recency.reason) reasons.push(recency.reason);
  }

  if (input.pakistanRelevance > 0) {
    const points = input.pakistanRelevance * 0.2;
    score += points;
    reasons.push(`Pakistan relevance ${input.pakistanRelevance}/100`);
  }

  if (input.corroboratingSourceCount > 0) {
    const points = Math.min(24, input.corroboratingSourceCount * 8);
    score += points;
    reasons.push(
      `${input.corroboratingSourceCount} corroborating source${input.corroboratingSourceCount === 1 ? "" : "s"}`,
    );
  }

  const headlineLower = input.headline.toLowerCase();
  if (BREAKING_SIGNALS.some((signal) => headlineLower.includes(signal))) {
    score += 15;
    reasons.push("Headline signals breaking news");
  }

  if (input.matchedPriorityKeywords.length > 0) {
    const points = Math.min(20, input.matchedPriorityKeywords.length * 10);
    score += points;
    reasons.push(`Matches priority keyword(s): ${input.matchedPriorityKeywords.join(", ")}`);
  }

  if (input.techRelevance.score === 0) {
    score -= NON_TECH_PENALTY;
    reasons.push("Not clearly technology-related — heavily deprioritized");
  }

  return { score: Math.round(score * 10) / 10, reasons };
}
