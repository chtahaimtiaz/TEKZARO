import type { ContentBlock } from "../content-blocks";

const WORD_SPLIT_RE = /[^a-z0-9']+/;

/**
 * Word n-grams (shingles) for copy-detection — deliberately NOT
 * stopword-filtered like lib/ingestion/normalize.ts's title-similarity
 * tokens: verbatim copying includes stopwords ("the", "and", "of"...), and
 * dropping them would hide exactly the signal this check needs to catch.
 */
export function shingleSet(text: string, n: number): Set<string> {
  const words = text.toLowerCase().split(WORD_SPLIT_RE).filter(Boolean);
  const shingles = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) {
    shingles.add(words.slice(i, i + n).join(" "));
  }
  return shingles;
}

/**
 * Jaccard similarity between two texts' word-shingle sets — same
 * intersection/union shape as lib/ingestion/normalize.ts's titleSimilarity,
 * applied to n-word phrases instead of single tokens so it actually
 * detects copied PHRASES, not just shared vocabulary (two independently
 * written articles about the same event will naturally share individual
 * words like company/product names — they won't naturally share the same
 * run of 5 consecutive words).
 */
export function shingleSimilarity(a: string, b: string, n: number): number {
  const setA = shingleSet(a, n);
  const setB = shingleSet(b, n);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const s of setA) if (setB.has(s)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export const SHINGLE_SIZE = 5;
// Provisional default, not a calibrated editorial threshold — same spirit
// as VERIFY_BATCH_SIZE's documented quota-arithmetic default (see
// lib/verification-actions.ts). Revisit against real drafts once enough
// exist to calibrate against.
export const ORIGINALITY_BLOCK_THRESHOLD = 0.35;

function plainTextOfBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
        case "heading":
        case "quote":
        case "pakistan-impact":
          return block.text;
        case "list":
          return block.items.join(" ");
        case "image":
          return block.alt;
        default:
          return "";
      }
    })
    .join(" ");
}

export interface OriginalityCheckResult {
  score: number;
  matchedAgainst: "primary" | "secondary" | null;
}

/**
 * Compares the AI-generated article body against the actual source text(s)
 * fetched during verification — the "never copy verbatim" rule was
 * previously prompt-only (see RESPONSE_SCHEMA_INSTRUCTIONS in
 * verify-and-synthesize.ts); this is the mechanical, code-enforced
 * backstop. Returns the MAX similarity found against any supplied source,
 * not an average — a single near-verbatim match against one source is the
 * real signal, regardless of how many other sources were also compared.
 */
export function checkOriginality(
  generatedBlocks: ContentBlock[],
  sourceTexts: { label: "primary" | "secondary"; text: string }[],
): OriginalityCheckResult {
  const generatedText = plainTextOfBlocks(generatedBlocks);
  let best: OriginalityCheckResult = { score: 0, matchedAgainst: null };
  for (const source of sourceTexts) {
    const score = shingleSimilarity(generatedText, source.text, SHINGLE_SIZE);
    if (score > best.score) {
      best = { score, matchedAgainst: source.label };
    }
  }
  return best;
}
