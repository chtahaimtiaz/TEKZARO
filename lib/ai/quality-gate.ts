import { blockPlainText, type ContentBlock } from "../content-blocks";
import type { EvidenceBundle } from "./evidence";
import { extractNumericClaims, hasHedgeLanguage, type ExtractedClaim } from "./claim-extraction";
import { detectNumericConflicts, type SourceConflict } from "./source-conflicts";
import { shingleSimilarity, SHINGLE_SIZE } from "./originality-check";
import { isPrimaryRank, isCorroboratingRank, SourceRank } from "./source-classification";

/**
 * Evaluates a synthesized draft against the evidence that produced it. Runs
 * after synthesis, before autoPublished or sentToReview is decided.
 *
 * This does not grade prose quality by taste. Every dimension traces to
 * something checkable: does a number appear in the evidence or follow
 * arithmetically from it, is a company/government claim attributed as such,
 * are two sections saying the same thing, is a heading generic. A 450-word
 * article built from thin evidence can score higher here than a 1,000-word
 * one built from the same evidence, because nothing here rewards length —
 * see QUALITY_WEIGHTS, none of which is "word count".
 */

export type QualityFailureCode =
  | "UNSUPPORTED_CLAIM"
  | "SOURCE_CONFLICT"
  | "MISSING_ATTRIBUTION"
  | "LOW_EVIDENCE_DENSITY"
  | "REPETITIVE_CONTENT"
  | "GENERIC_HEADINGS"
  | "INSUFFICIENT_CONTEXT"
  | "MISSING_LIMITATIONS"
  | "MALFORMED_OUTPUT"
  | "LOW_SOURCE_CONFIDENCE";

export interface QualityFailure {
  code: QualityFailureCode;
  /** Specific enough for an editor to act on without re-deriving it —
   * never "Article failed quality check." */
  detail: string;
}

export interface QualityGateResult {
  score: number; // 0-100
  passed: boolean;
  failures: QualityFailure[];
  dimensionScores: Record<string, number>;
  claims: ExtractedClaim[];
  conflicts: SourceConflict[];
}

/** Extension point: adjust emphasis without touching the scoring logic.
 * Deliberately excludes anything resembling "length" or "word count" — the
 * one dimension the brief explicitly forbids letting dominate. */
export const QUALITY_WEIGHTS = {
  evidenceCoverage: 0.3,
  attribution: 0.2,
  structure: 0.15,
  antiFiller: 0.2,
  sourceQuality: 0.15,
} as const;

/** Below this, an article cannot pass regardless of score — these are
 * integrity failures, not quality-of-writing ones. */
const HARD_FAIL_CODES: ReadonlySet<QualityFailureCode> = new Set(["UNSUPPORTED_CLAIM", "MALFORMED_OUTPUT"]);
const PASS_THRESHOLD = 60;

const GENERIC_HEADINGS = new Set([
  "what happened", "why it matters", "more details", "more information",
  "conclusion", "overview", "summary", "background", "details", "the details",
]);

function proseBlocks(blocks: ContentBlock[]): ContentBlock[] {
  // fact-table and faq carry real, checkable prose (a fabricated price in a
  // table row is exactly as dangerous as one buried in a sentence) — see
  // claim-extraction.ts and blockPlainText's own comment for why these
  // routes were consolidated onto one shared function instead of staying as
  // four separate copies that could each independently forget a new type.
  return blocks.filter((b) => b.type === "paragraph" || b.type === "list" || b.type === "quote" || b.type === "fact-table" || b.type === "faq");
}

function wordCount(blocks: ContentBlock[]): number {
  return proseBlocks(blocks)
    .map(blockPlainText)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function checkGenericHeadings(blocks: ContentBlock[]): { failure: QualityFailure | null; score: number } {
  const headings = blocks.filter((b) => b.type === "heading");
  const generic = headings.filter((h) => GENERIC_HEADINGS.has(h.text.trim().toLowerCase()));
  if (generic.length > 0) {
    return {
      failure: { code: "GENERIC_HEADINGS", detail: `Generic heading(s) carry no subject: ${generic.map((h) => `"${h.text}"`).join(", ")}` },
      score: 0.3,
    };
  }
  return { failure: null, score: headings.length > 0 ? 1 : 0.7 };
}

/** Compares every pair of prose blocks for near-duplicate content, reusing
 * the same shingle-similarity measure already used to check a draft against
 * its sources (lib/ai/originality-check.ts) — applied here within the
 * article instead of against a source. */
function checkRepetition(blocks: ContentBlock[]): { failure: QualityFailure | null; score: number } {
  const texts = proseBlocks(blocks)
    .map(blockPlainText)
    .filter((t) => t.split(/\s+/).length >= SHINGLE_SIZE + 3);
  let worst = 0;
  let pair: [string, string] | null = null;
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const sim = shingleSimilarity(texts[i], texts[j], SHINGLE_SIZE);
      if (sim > worst) {
        worst = sim;
        pair = [texts[i], texts[j]];
      }
    }
  }
  if (worst > 0.5 && pair) {
    return {
      failure: {
        code: "REPETITIVE_CONTENT",
        detail: `Two sections restate the same content (${Math.round(worst * 100)}% shingle overlap): "${pair[0].slice(0, 70)}..."`,
      },
      score: 1 - worst,
    };
  }
  return { failure: null, score: 1 };
}

function checkAttribution(claims: ExtractedClaim[]): { failure: QualityFailure | null; score: number } {
  // A claim traced to a PRIMARY-rank document (a company or government
  // making a claim about itself) needs attribution language in the draft —
  // an unhedged company figure is exactly the "40% faster" problem the
  // editorial standard exists to prevent.
  const needsAttribution = claims.filter(
    (c) => c.supportingDocument && isPrimaryRank(c.supportingDocument.rank) && c.claimType === "DIRECT_FACT",
  );
  if (needsAttribution.length > 0) {
    return {
      failure: {
        code: "MISSING_ATTRIBUTION",
        detail: `${needsAttribution.length} claim(s) sourced to a primary/company document are stated as plain fact without attribution language: "${needsAttribution[0].claimText.slice(0, 90)}"`,
      },
      score: Math.max(0, 1 - needsAttribution.length * 0.25),
    };
  }
  const attributed = claims.filter((c) => c.claimType === "ATTRIBUTED_CLAIM").length;
  return { failure: null, score: claims.length === 0 ? 1 : Math.min(1, 0.6 + attributed / Math.max(1, claims.length)) };
}

function checkEvidenceCoverage(claims: ExtractedClaim[]): { failures: QualityFailure[]; score: number } {
  const unsupported = claims.filter((c) => c.claimType === "UNSUPPORTED");
  const failures: QualityFailure[] = [];
  if (unsupported.length > 0) {
    failures.push({
      code: "UNSUPPORTED_CLAIM",
      detail: `${unsupported.length} figure(s) appear in the draft with no supporting evidence and no derivable basis: ${unsupported
        .slice(0, 3)
        .map((c) => `"${c.claimText.slice(0, 60)}"`)
        .join("; ")}`,
    });
  }
  const total = claims.length;
  const score = total === 0 ? 1 : Math.max(0, 1 - unsupported.length / total);
  return { failures, score };
}

function checkSourceQuality(evidence: EvidenceBundle): { failure: QualityFailure | null; score: number } {
  if (evidence.documents.length === 0) {
    return { failure: { code: "LOW_SOURCE_CONFIDENCE", detail: "No evidence documents were retrieved for this story." }, score: 0.2 };
  }
  const bestRank = Math.min(...evidence.documents.map((d) => d.rank));
  const rankScore = { [SourceRank.PRIMARY]: 1, [SourceRank.MAJOR_INDEPENDENT]: 0.85, [SourceRank.SPECIALIST]: 0.7, [SourceRank.GENERAL]: 0.5, [SourceRank.AGGREGATOR]: 0.2, [SourceRank.UNKNOWN]: 0.3 }[bestRank as SourceRank] ?? 0.3;
  if (rankScore < 0.4) {
    return { failure: { code: "LOW_SOURCE_CONFIDENCE", detail: `Best available evidence is only ${bestRank}-ranked.` }, score: rankScore };
  }
  return { failure: null, score: rankScore };
}

export interface QualityGateInput {
  headline: string;
  excerpt: string;
  blocks: ContentBlock[];
  evidence: EvidenceBundle;
}

export function runQualityGate(input: QualityGateInput): QualityGateResult {
  const { blocks, evidence } = input;
  const claims = extractNumericClaims(blocks, evidence);
  const conflicts = detectNumericConflicts(evidence);
  const failures: QualityFailure[] = [];

  const coverage = checkEvidenceCoverage(claims);
  failures.push(...coverage.failures);

  const attribution = checkAttribution(claims);
  if (attribution.failure) failures.push(attribution.failure);

  const headings = checkGenericHeadings(blocks);
  if (headings.failure) failures.push(headings.failure);

  const repetition = checkRepetition(blocks);
  if (repetition.failure) failures.push(repetition.failure);

  const sourceQuality = checkSourceQuality(evidence);
  if (sourceQuality.failure) failures.push(sourceQuality.failure);

  if (conflicts.length > 0) {
    failures.push({
      code: "SOURCE_CONFLICT",
      detail: `Sources disagree on ${conflicts.map((c) => `"${c.keyword}"`).join(", ")} without the article acknowledging it`,
    });
  }

  // The FINAL PRINCIPLE's own example, operationalised: strong evidence
  // producing almost nothing is a synthesis failure, not appropriate
  // brevity. This is the one place richness and length interact, and it is
  // asymmetric on purpose — thin evidence producing a short article is
  // never flagged; only the reverse is.
  const words = wordCount(blocks);
  if (evidence.richness === "VERY_RICH" && words < 200) {
    failures.push({
      code: "INSUFFICIENT_CONTEXT",
      detail: `Evidence was rated VERY_RICH (${evidence.totalChars} characters across ${evidence.documents.length} sources) but the draft is only ${words} words — the material was not used.`,
    });
  }

  // A flagged conflict or an unsupported claim with no hedge anywhere in the
  // article is a real gap, not a style nitpick — checked only when there is
  // something that should have been hedged, to avoid demanding limitations
  // language on a clean, well-supported article.
  const needsHedge = conflicts.length > 0 || claims.some((c) => c.claimType === "UNSUPPORTED" || c.claimType === "UNCERTAIN");
  if (needsHedge && !hasHedgeLanguage(blocks)) {
    failures.push({
      code: "MISSING_LIMITATIONS",
      detail: "The article has an unresolved conflict or unverifiable figure but contains no language acknowledging uncertainty.",
    });
  }

  const evidenceDensityScore = evidence.documents.length === 0 ? 0.3 : Math.min(1, evidence.totalChars / 6000);
  if (evidence.richness !== "THIN" && evidenceDensityScore < 0.3) {
    failures.push({ code: "LOW_EVIDENCE_DENSITY", detail: "Very little usable evidence text was actually available." });
  }

  const dimensionScores: Record<string, number> = {
    evidenceCoverage: coverage.score,
    attribution: attribution.score,
    structure: (headings.score + repetition.score) / 2,
    antiFiller: repetition.score,
    sourceQuality: sourceQuality.score,
  };

  const score = Math.round(
    Object.entries(QUALITY_WEIGHTS).reduce((sum, [key, weight]) => sum + (dimensionScores[key] ?? 0) * weight, 0) * 100,
  );

  const hasHardFail = failures.some((f) => HARD_FAIL_CODES.has(f.code));
  const passed = !hasHardFail && score >= PASS_THRESHOLD;

  return { score, passed, failures, dimensionScores, claims, conflicts };
}
