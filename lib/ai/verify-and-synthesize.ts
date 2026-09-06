import "server-only";
import { runStructuredTask, NEWSROOM_SYSTEM_PROMPT } from "./tasks";
import { EDITORIAL_STANDARD } from "./editorial-standard";
import { gatherEvidence, formatEvidence, type EvidenceBundle } from "./evidence";
import { isSearchConfigured, searchWeb } from "../search/web-search";
import { isSynthesizableBlock } from "./synthesizable-blocks";
import { BLOCK_SHAPE_EXAMPLE, BLOCK_SHAPE_RULES } from "./block-schema-doc";
import { checkOriginality } from "./originality-check";
import type { ContentBlock } from "../content-blocks";
import type { ArticleVerificationStatus, SourceItem, Source } from "@prisma/client";

export interface VerifyAndSynthesizeResult {
  verificationStatus: ArticleVerificationStatus;
  primarySourceUrl: string | null;
  /** A second, independent reputable (TIER_1/TIER_2) source that also
   * discusses this story, if one was found — optional corroboration, never
   * required for PRIMARY_SOURCE_CONFIRMED (see lib/ai/evidence.ts). */
  secondarySourceUrl: string | null;
  /** AI-reported 0-100 confidence — editorial transparency signal only.
   * lib/verification-actions.ts's auto-publish gate never reads this. */
  verificationConfidence: number | null;
  /** The specific claims the model says it compared against the source(s). */
  claimsChecked: string[];
  notes: string;
  draft: { headline: string; excerpt: string; blocks: ContentBlock[] } | null;
  /** 0-1 max word-shingle similarity between the draft and the actual
   * primary/secondary source text fetched below — the mechanical backstop
   * for the "never copy verbatim" prompt rule (see originality-check.ts).
   * Null when no draft was produced (nothing to compare) or no source text
   * was fetched to compare against. */
  originalityScore: number | null;
  /** Null when no AI call was ever attempted (e.g. search not configured) —
   * distinct from a call that was attempted and failed, which still gets a
   * generationId via lib/ai/tasks.ts's own audit logging. */
  generationId: string | null;
  /** Null only when nothing was ever gathered (search unconfigured or
   * failed before any fetch was attempted). Once gathering runs, the
   * bundle is always attached — including on a failed/unparseable AI
   * call — so the caller can persist evidence and run the quality gate
   * regardless of whether synthesis itself succeeded. */
  evidence: EvidenceBundle | null;
  /** How many times a malformed response forced a retry. 0 when no AI
   * call was attempted at all. */
  retryCount: number;
}

function emptyResult(
  notes: string,
  generationId: string | null = null,
  evidence: EvidenceBundle | null = null,
  retryCount = 0,
): VerifyAndSynthesizeResult {
  return {
    verificationStatus: "UNVERIFIED",
    primarySourceUrl: null,
    secondarySourceUrl: null,
    verificationConfidence: null,
    claimsChecked: [],
    notes,
    draft: null,
    originalityScore: null,
    generationId,
    evidence,
    retryCount,
  };
}

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "UNVERIFIED",
  "PRIMARY_SOURCE_CONFIRMED",
  "PRIMARY_SOURCE_NOT_FOUND",
  "CONTRADICTION_FOUND",
]);

interface ParsedModelOutput {
  verificationStatus: ArticleVerificationStatus;
  verificationConfidence: number | null;
  claimsChecked: string[];
  notes: string;
  draft: { headline: string; excerpt: string; blocks: ContentBlock[] } | null;
}

/** Parses the model's JSON response defensively — malformed/unexpected
 * shape degrades to null (caller treats that as UNVERIFIED), never throws.
 * Only verificationStatus/notes are load-bearing (missing/invalid fails the
 * whole parse); verificationConfidence/claimsChecked are enrichment fields
 * that degrade individually to null/[] rather than invalidating an
 * otherwise-usable response. */
/**
 * Shape-validates an already-parsed JSON value. The parsing itself — fence
 * stripping, JSON.parse, the embedded-object salvage attempt — now happens
 * once, generically, in lib/ai/structured-completion.ts, which retries when
 * a model ignores the requested JSON format. This function's only job is
 * deciding whether a successfully parsed object is USABLE: the right
 * enum value, a non-empty headline, real blocks. Returning null here is
 * exactly as final as a parse failure — structured-completion treats an
 * invalid shape and invalid JSON identically, both triggering the same
 * bounded retry.
 */
function parseModelOutput(raw: unknown): ParsedModelOutput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.verificationStatus !== "string" || !VALID_STATUSES.has(obj.verificationStatus)) return null;
  if (typeof obj.notes !== "string") return null;

  const verificationConfidence =
    typeof obj.verificationConfidence === "number" && obj.verificationConfidence >= 0 && obj.verificationConfidence <= 100
      ? Math.round(obj.verificationConfidence)
      : null;
  const claimsChecked =
    Array.isArray(obj.claimsChecked) && obj.claimsChecked.every((c) => typeof c === "string")
      ? (obj.claimsChecked as string[])
      : [];

  let draft: ParsedModelOutput["draft"] = null;
  if (obj.draft !== null && typeof obj.draft === "object") {
    const d = obj.draft as Record<string, unknown>;
    if (
      typeof d.headline === "string" &&
      d.headline.trim().length > 0 &&
      typeof d.excerpt === "string" &&
      Array.isArray(d.blocks) &&
      d.blocks.length > 0 &&
      d.blocks.every(isSynthesizableBlock)
    ) {
      draft = { headline: d.headline, excerpt: d.excerpt, blocks: d.blocks as ContentBlock[] };
    }
  }

  return {
    verificationStatus: obj.verificationStatus as ArticleVerificationStatus,
    verificationConfidence,
    claimsChecked,
    notes: obj.notes,
    draft,
  };
}

const RESPONSE_SCHEMA_INSTRUCTIONS = `
Respond with ONLY a single JSON object — no markdown code fences, no commentary before or after. Exact shape:
{
  "verificationStatus": "PRIMARY_SOURCE_CONFIRMED" | "PRIMARY_SOURCE_NOT_FOUND" | "CONTRADICTION_FOUND" | "UNVERIFIED",
  "verificationConfidence": 0-100,
  "claimsChecked": ["specific factual claim you compared against the source(s)", "..."],
  "notes": "plain-English explanation of your reasoning, for a human editor",
  "draft": null | {
    "headline": "specific and accurate, in TEKZARO's own words — never clickbait, and never claiming more than the article substantiates",
    "excerpt": "the standfirst: 1-2 sentences that ADD information rather than restating the headline, and give the reader a reason to continue",
    "blocks": ${BLOCK_SHAPE_EXAMPLE}
  }
}
Rules:
- "claimsChecked": list the specific factual claims from the discovered story you actually compared against the source material provided below — an empty array if none could be checked.
- "verificationConfidence": your own honest confidence (0-100) that this story is accurately reported. This is recorded for editorial transparency ONLY and never by itself decides whether anything gets published — do not inflate it.
- Use "verificationStatus": "PRIMARY_SOURCE_CONFIRMED" ONLY if a primary source's text was actually provided to you below AND it corroborates the story. A secondary source, if provided, strengthens this but is NEVER required — an official primary source is sufficient on its own. If no primary source text was provided, you MUST NOT claim PRIMARY_SOURCE_CONFIRMED, even if a secondary source was provided.
- Use "CONTRADICTION_FOUND" if any provided source's text contradicts the discovered claims.
- Open the body with 2-4 paragraph blocks, then alternate heading blocks with the paragraphs beneath them. A "heading" block always uses level 2.
- Write ORIGINAL prose in TEKZARO's own voice for "draft". Never copy sentences verbatim from the source material provided — summarize and re-report, don't reproduce.
- Include an inline attribution line naming where this was first reported and every official/independent source it was verified against (e.g. "According to Samsung's newsroom... TechCrunch first reported this development, and it was independently corroborated by The Verge").
- Write the draft whenever you have usable material, and report its status honestly. If no primary source text was provided but a secondary source's text was — or the discovering outlet's own report carries real substance beyond a bare headline — still write the draft and set "verificationStatus" to "PRIMARY_SOURCE_NOT_FOUND". A draft in that state is routed to a human editor and can never be published automatically, so withholding it removes an editor's option rather than protecting a reader. Reserve "draft": null for genuinely unusable input: no source text at all and nothing but a headline.
- When no primary source text was provided, the draft MUST attribute every substantive claim to the outlet that reported it ("TechCrunch reports that…", "According to ProPakistani…") rather than asserting it as independently established fact, and MUST NOT introduce any detail, figure, name or date that appears nowhere in the material provided to you.
${BLOCK_SHAPE_RULES}
`.trim();

export async function verifyAndSynthesize(params: {
  requestedById: string;
  item: SourceItem & { source: Source };
}): Promise<VerifyAndSynthesizeResult> {
  const { requestedById, item } = params;

  if (!isSearchConfigured()) {
    return emptyResult("Search not configured (SEARCH_API_KEY missing) — no verification attempted.");
  }

  let searchResults: { title: string; url: string; snippet: string }[];
  try {
    searchResults = await searchWeb(item.headline);
  } catch (err) {
    return emptyResult(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Evidence gathering replaces the old "find two URLs on curated domains and
  // strip their tags" path. Candidates are ranked by evidentiary weight
  // (lib/ai/source-classification.ts) rather than by whether TEKZARO happens
  // to ingest their feed, and each page is reduced to its article body with
  // metadata preserved (lib/ai/article-extract.ts).
  const evidence = await gatherEvidence({
    originatingUrl: item.sourceUrl,
    searchResults,
  });
  const primaryFetched = evidence.primary;
  const secondaryFetched = evidence.corroborating;

  const userPrompt = [
    `Discovered story:`,
    `Headline: ${item.headline}`,
    `Summary: ${item.excerpt ?? "(none provided)"}`,
    `Reported by: ${item.source.name} (${item.source.url})`,
    ``,
    primaryFetched
      ? `A primary source WAS retrieved for this story (SOURCE marked PRIMARY below).`
      : `No primary/official source could be retrieved for this story. You must not claim PRIMARY_SOURCE_CONFIRMED.`,
    ``,
    formatEvidence(evidence),
    ``,
    RESPONSE_SCHEMA_INSTRUCTIONS,
  ].join("\n");

  const result = await runStructuredTask({
    task: "VERIFY_PRIMARY_SOURCE",
    requestedById,
    inputRef: { sourceItemId: item.id, primarySourceUrl: primaryFetched?.url ?? null, secondarySourceUrl: secondaryFetched?.url ?? null },
    systemPrompt: `${NEWSROOM_SYSTEM_PROMPT}\n\n${EDITORIAL_STANDARD}\n\n${RESPONSE_SCHEMA_INSTRUCTIONS}`,
    userPrompt,
    validate: parseModelOutput,
  });

  if (!result.ok || !result.data) {
    return emptyResult(
      result.notConfigured
        ? "AI not configured — no verification attempted."
        : `AI call failed: ${result.error ?? "unknown error"}`,
      result.generationId,
      evidence,
      result.retryCount,
    );
  }

  const parsed = result.data;

  // Deterministic override, not just a prompt instruction: the model cannot
  // have confirmed or contradicted a primary source that was never actually
  // fetched for it to read, regardless of what it claims. The secondary
  // source never unlocks CONFIRMED by itself — see RESPONSE_SCHEMA_INSTRUCTIONS.
  const verificationStatus: ArticleVerificationStatus = primaryFetched ? parsed.verificationStatus : "PRIMARY_SOURCE_NOT_FOUND";

  const sourceTexts = [
    primaryFetched ? { label: "primary" as const, text: primaryFetched.text } : null,
    secondaryFetched ? { label: "secondary" as const, text: secondaryFetched.text } : null,
  ].filter((s): s is { label: "primary" | "secondary"; text: string } => s !== null);
  const originalityScore = parsed.draft && sourceTexts.length > 0 ? checkOriginality(parsed.draft.blocks, sourceTexts).score : null;

  return {
    verificationStatus,
    primarySourceUrl: primaryFetched?.url ?? null,
    secondarySourceUrl: secondaryFetched?.url ?? null,
    verificationConfidence: parsed.verificationConfidence,
    claimsChecked: parsed.claimsChecked,
    notes: parsed.notes,
    draft: parsed.draft,
    originalityScore,
    generationId: result.generationId,
    evidence,
    retryCount: result.retryCount,
  };
}
