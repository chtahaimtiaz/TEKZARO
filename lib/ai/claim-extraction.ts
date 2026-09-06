import { blockPlainText, type ContentBlock } from "../content-blocks";
import type { EvidenceBundle, EvidenceDocument } from "./evidence";
import { tryDeriveMatch } from "./derived-numbers";

/**
 * Classifies factual claims in a synthesized draft against the evidence
 * bundle that produced it — built entirely from the model's own output text,
 * never from anything the model reports about itself. The model's JSON
 * schema is unchanged: it is never asked to label its own claims, because a
 * model that can fabricate a statistic can just as easily fabricate high
 * confidence that the statistic is sound. This is a check ON the model,
 * not something the model performs.
 *
 * Deliberately scoped to NUMERIC claims. A number is the one kind of factual
 * assertion this module can verify mechanically and honestly — it either
 * appears in the evidence, is derivable from figures that do, or it does
 * not. Classifying a general prose sentence as DIRECT_FACT vs. ANALYSIS
 * would require judgment this module cannot respons­ibly claim to have, and
 * a wrong classification there would be worse than no classification. This
 * is exactly where the numeric-statistic fabrication risk concentrates
 * anyway (revenue figures, benchmark percentages, valuations, user counts).
 */

export type ClaimType =
  | "DIRECT_FACT"
  | "ATTRIBUTED_CLAIM"
  | "DERIVED_FACT"
  | "ANALYSIS"
  | "UNCERTAIN"
  | "UNSUPPORTED";

export interface ExtractedClaim {
  claimText: string;
  claimType: ClaimType;
  supportingDocument: EvidenceDocument | null;
  sourceExcerpt: string | null;
  isDerived: boolean;
  derivedFromValues: number[] | null;
  /** 0-100. Not the model's self-reported confidence — a mechanical score:
   * a verbatim match in a primary source scores highest, an unsupported
   * number scores 0. */
  confidence: number;
}

/** Phrases that mark a nearby figure as something a party said rather than
 * an independently established fact. Checked within the same sentence/claim
 * window, never across the whole article — an attribution far from the
 * number it doesn't govern would be a false negative, which is the safe
 * direction to err in here (it costs a downgrade to DIRECT_FACT, not a
 * fabricated upgrade). */
const ATTRIBUTION_RE =
  /\b(according to|the company (?:said|claims|says|reported)|said|says|claims?|reportedly|told|stated|announced|says\b)\b/i;

const HEDGE_RE =
  /\b(has not disclosed|did not disclose|declined to|not (?:yet )?(?:independently )?(?:verified|confirmed|disclosed)|remains? unclear|unclear whether|no independent|not been audited)\b/i;

/** Matches a number with optional thousands separators and a decimal part,
 * with or without a unit word immediately after (million, billion, percent,
 * %, TB/s, etc.) — the unit is captured but classification only compares the
 * numeric value, since "412 million" and "412,000,000" describe the same
 * figure in different words. */
const NUMBER_RE = /(?<![\w.])(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)\s*(%|percent|million|billion|trillion|thousand|x|tb\/s|gb\/s|mbps|ghz|mhz|nm)?\b/gi;

const UNIT_MULTIPLIER: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

interface NumberToken {
  raw: string;
  value: number;
  unit: string | null;
  index: number;
}

function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const numeric = Number(m[1].replace(/,/g, ""));
    if (Number.isNaN(numeric)) continue;
    const unit = m[2]?.toLowerCase() ?? null;
    const multiplier = unit ? (UNIT_MULTIPLIER[unit] ?? 1) : 1;
    out.push({ raw: m[0].trim(), value: numeric * multiplier, unit, index: m.index ?? 0 });
  }
  return out;
}

/** Same tolerance rule throughout: numbers this close are treated as the
 * same figure, which absorbs formatting differences (412 vs 412.0,
 * "$320 million" vs "320,000,000") without treating a genuinely different
 * number as a match. */
function numbersMatch(a: number, b: number): boolean {
  if (a === 0 || b === 0) return a === b;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) < 0.005;
}

function findInEvidence(value: number, documents: EvidenceDocument[]): { doc: EvidenceDocument; excerpt: string } | null {
  for (const doc of documents) {
    const numbers = extractNumbers(doc.text);
    const hit = numbers.find((n) => numbersMatch(n.value, value));
    if (hit) {
      const start = Math.max(0, hit.index - 90);
      const end = Math.min(doc.text.length, hit.index + hit.raw.length + 90);
      return { doc, excerpt: doc.text.slice(start, end).trim() };
    }
  }
  return null;
}

/** Splits block text into claim-sized windows (roughly sentences) so an
 * attribution phrase or hedge is checked against the claim that actually
 * contains it, not the whole article. */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractNumericClaims(blocks: ContentBlock[], evidence: EvidenceBundle): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const text = blockPlainText(block);
    if (!text) continue;

    for (const sentence of sentencesOf(text)) {
      const numbers = extractNumbers(sentence);
      if (numbers.length === 0) continue;

      for (const num of numbers) {
        // The same figure often recurs (a growth rate stated once, then
        // referenced again in a heading) — only the first occurrence is
        // worth a row; repeats add no new traceability information.
        const key = `${num.value}|${sentence.slice(0, 40)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const direct = findInEvidence(num.value, evidence.documents);
        if (direct) {
          const attributed = ATTRIBUTION_RE.test(sentence);
          claims.push({
            claimText: sentence,
            claimType: attributed ? "ATTRIBUTED_CLAIM" : "DIRECT_FACT",
            supportingDocument: direct.doc,
            sourceExcerpt: direct.excerpt,
            isDerived: false,
            derivedFromValues: null,
            confidence: attributed ? 80 : 90,
          });
          continue;
        }

        // Not found verbatim — is it derivable from figures that ARE in the
        // evidence? All numbers across all documents are searched, so a
        // growth figure computed from a primary source's before/after pair
        // is recognised even if the draft states the percentage separately
        // from the two source figures.
        const allSourceNumbers = evidence.documents.flatMap((d) => extractNumbers(d.text).map((n) => n.value));
        const derived = allSourceNumbers.length >= 2 ? tryDeriveMatch(num.value, allSourceNumbers) : null;
        if (derived) {
          claims.push({
            claimText: sentence,
            claimType: "DERIVED_FACT",
            supportingDocument: null,
            sourceExcerpt: null,
            isDerived: true,
            derivedFromValues: derived.from,
            confidence: 70,
          });
          continue;
        }

        // Genuinely unsupported: no evidence at all, so nothing to compare
        // against — the number cannot be graded, only flagged.
        if (evidence.documents.length === 0) {
          claims.push({
            claimText: sentence,
            claimType: "UNCERTAIN",
            supportingDocument: null,
            sourceExcerpt: null,
            isDerived: false,
            derivedFromValues: null,
            confidence: 0,
          });
          continue;
        }

        claims.push({
          claimText: sentence,
          claimType: "UNSUPPORTED",
          supportingDocument: null,
          sourceExcerpt: null,
          isDerived: false,
          derivedFromValues: null,
          confidence: 0,
        });
      }
    }
  }

  return claims;
}

export function hasHedgeLanguage(blocks: ContentBlock[]): boolean {
  return blocks.some((b) => HEDGE_RE.test(blockPlainText(b)));
}
