import "server-only";
import { prisma } from "../prisma";
import { runTask, NEWSROOM_SYSTEM_PROMPT } from "./tasks";
import { EDITORIAL_STANDARD } from "./editorial-standard";
import { isSearchConfigured, searchWeb } from "../search/web-search";
import { safeFetch } from "../security/safe-fetch";
import { isSynthesizableBlock } from "./synthesizable-blocks";
import { checkOriginality } from "./originality-check";
import type { ContentBlock } from "../content-blocks";
import type { ArticleVerificationStatus, SourceItem, Source } from "@prisma/client";

export interface VerifyAndSynthesizeResult {
  verificationStatus: ArticleVerificationStatus;
  primarySourceUrl: string | null;
  /** A second, independent reputable (TIER_1/TIER_2) source that also
   * discusses this story, if one was found — optional corroboration, never
   * required for PRIMARY_SOURCE_CONFIRMED (see findSourceCandidates). */
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
   * generationId via runTask's own audit logging. */
  generationId: string | null;
}

function emptyResult(notes: string, generationId: string | null = null): VerifyAndSynthesizeResult {
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
  };
}

// Raised alongside the editorial standard: an article carrying real
// technical context and comparison needs more of the source than a
// three-paragraph rewrite did. Both gateways front models with large
// context windows, so the cost is tokens rather than truncation.
const MAX_SOURCE_CHARS = 12000;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Finds up to two search results hosted on known, curated Source domains:
 * a primary (TIER_1 — official/company newsroom) match, and a secondary
 * (TIER_2 — reputable tech media) match, each excluding the discovered
 * item's own source domain and each other. Deliberately deterministic, not
 * LLM-guessed — consistent with this codebase's existing preference for
 * auditable, code-driven classification (tech-relevance, Pakistan-relevance,
 * priority scoring all do this already) — and reuses the tier curation
 * already done when the source list was built, rather than hand-maintaining
 * a second "which domains count as reputable" list that could drift out of
 * sync.
 */
async function findSourceCandidates(
  results: { title: string; url: string; snippet: string }[],
  ownSourceUrl: string,
): Promise<{ primaryUrl: string | null; secondaryUrl: string | null }> {
  const reputable = await prisma.source.findMany({
    where: { tier: { in: ["TIER_1", "TIER_2"] }, active: true },
    select: { url: true, tier: true },
  });
  const tier1Hostnames = new Set(
    reputable.filter((s) => s.tier === "TIER_1").map((s) => hostnameOf(s.url)).filter((h): h is string => h !== null),
  );
  const tier2Hostnames = new Set(
    reputable.filter((s) => s.tier === "TIER_2").map((s) => hostnameOf(s.url)).filter((h): h is string => h !== null),
  );
  const ownHostname = hostnameOf(ownSourceUrl);

  const primaryMatch = results.find((r) => {
    const h = hostnameOf(r.url);
    return h !== null && tier1Hostnames.has(h) && h !== ownHostname;
  });
  const primaryHostname = primaryMatch ? hostnameOf(primaryMatch.url) : null;

  const secondaryMatch = results.find((r) => {
    const h = hostnameOf(r.url);
    return h !== null && tier2Hostnames.has(h) && h !== ownHostname && h !== primaryHostname;
  });

  return { primaryUrl: primaryMatch?.url ?? null, secondaryUrl: secondaryMatch?.url ?? null };
}

/** Minimum readable characters before a fetched page counts as usable
 * source text. A blocked or paywalled page still returns a short HTML body;
 * treating that as source material is what let a blocked page look
 * "fetched" while giving the model nothing to verify against.
 *
 * Set from measurement rather than taste: sampling real search results,
 * 403 interstitials stripped down to roughly 510 characters while the
 * smallest genuine article was 2,442. 800 sits clear of the former without
 * approaching the latter. */
const MIN_SOURCE_CHARS = 800;

/** Strips scripts, styles and tags down to readable prose. The model was
 * previously handed raw HTML, so most of its 6,000-character budget went on
 * navigation, cookie banners and inline scripts rather than the article. */
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSourceText(url: string | null): Promise<{ text: string; finalUrl: string } | null> {
  if (!url) return null;
  try {
    const fetched = await safeFetch(url);
    // Status was previously ignored entirely: a 403 or paywall page returned
    // its error body, which counted as a successfully fetched primary
    // source. That both suppressed the PRIMARY_SOURCE_NOT_FOUND override and
    // handed the model an unusable page to "verify" against.
    if (fetched.status !== 200) return null;
    const text = htmlToText(fetched.text);
    if (text.length < MIN_SOURCE_CHARS) return null;
    return { text: text.slice(0, MAX_SOURCE_CHARS), finalUrl: fetched.finalUrl };
  } catch {
    // Unreachable candidate doesn't count as a confirmable/citable source for
    // this run — proceed as if none was found, rather than trusting a URL we
    // couldn't actually read.
    return null;
  }
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
function parseModelOutput(text: string): ParsedModelOutput | null {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    return null;
  }
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
    "blocks": [ { "type": "paragraph", "text": "..." }, { "type": "heading", "level": 2, "text": "..." }, { "type": "list", "style": "bullet", "items": ["..."] }, { "type": "quote", "text": "...", "cite": "optional" }, { "type": "pakistan-impact", "text": "..." } ]
  }
}
Rules:
- "claimsChecked": list the specific factual claims from the discovered story you actually compared against the source material provided below — an empty array if none could be checked.
- "verificationConfidence": your own honest confidence (0-100) that this story is accurately reported. This is recorded for editorial transparency ONLY and never by itself decides whether anything gets published — do not inflate it.
- Use "verificationStatus": "PRIMARY_SOURCE_CONFIRMED" ONLY if a primary source's text was actually provided to you below AND it corroborates the story. A secondary source, if provided, strengthens this but is NEVER required — an official primary source is sufficient on its own. If no primary source text was provided, you MUST NOT claim PRIMARY_SOURCE_CONFIRMED, even if a secondary source was provided.
- Use "CONTRADICTION_FOUND" if any provided source's text contradicts the discovered claims.
- Open the body with 2-4 paragraph blocks, then alternate heading blocks with the paragraphs beneath them. A "heading" block always uses level 2. Use "pakistan-impact" at most once, only when a real, evidenced Pakistan implication exists in the source material — it renders as a "What This Means for Pakistan" callout, so never emit it merely because the article is otherwise global.
- Write ORIGINAL prose in TEKZARO's own voice for "draft". Never copy sentences verbatim from the source material provided — summarize and re-report, don't reproduce.
- Include an inline attribution line naming where this was first reported and every official/independent source it was verified against (e.g. "According to Samsung's newsroom... TechCrunch first reported this development, and it was independently corroborated by The Verge").
- Write the draft whenever you have usable material, and report its status honestly. If no primary source text was provided but a secondary source's text was — or the discovering outlet's own report carries real substance beyond a bare headline — still write the draft and set "verificationStatus" to "PRIMARY_SOURCE_NOT_FOUND". A draft in that state is routed to a human editor and can never be published automatically, so withholding it removes an editor's option rather than protecting a reader. Reserve "draft": null for genuinely unusable input: no source text at all and nothing but a headline.
- When no primary source text was provided, the draft MUST attribute every substantive claim to the outlet that reported it ("TechCrunch reports that…", "According to ProPakistani…") rather than asserting it as independently established fact, and MUST NOT introduce any detail, figure, name or date that appears nowhere in the material provided to you.
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

  const { primaryUrl, secondaryUrl } = await findSourceCandidates(searchResults, item.source.url);
  const primaryFetched = await fetchSourceText(primaryUrl);
  const secondaryFetched = await fetchSourceText(secondaryUrl);

  const userPrompt = [
    `Discovered story:`,
    `Headline: ${item.headline}`,
    `Summary: ${item.excerpt ?? "(none provided)"}`,
    `Reported by: ${item.source.name} (${item.source.url})`,
    ``,
    primaryFetched
      ? `Primary source text found at ${primaryFetched.finalUrl}:\n${primaryFetched.text}`
      : `No primary/official source could be found or read for this story.`,
    ``,
    secondaryFetched
      ? `Secondary independent source text found at ${secondaryFetched.finalUrl}:\n${secondaryFetched.text}`
      : `No secondary independent source could be found or read for this story.`,
    ``,
    RESPONSE_SCHEMA_INSTRUCTIONS,
  ].join("\n");

  const result = await runTask({
    task: "VERIFY_PRIMARY_SOURCE",
    requestedById,
    inputRef: { sourceItemId: item.id, primarySourceUrl: primaryFetched?.finalUrl ?? null, secondarySourceUrl: secondaryFetched?.finalUrl ?? null },
    systemPrompt: `${NEWSROOM_SYSTEM_PROMPT}\n\n${EDITORIAL_STANDARD}\n\n${RESPONSE_SCHEMA_INSTRUCTIONS}`,
    userPrompt,
  });

  if (!result.ok || !result.text) {
    return emptyResult(
      result.notConfigured ? "AI not configured — no verification attempted." : `AI call failed: ${result.error ?? "unknown error"}`,
      result.generationId,
    );
  }

  const parsed = parseModelOutput(result.text);
  if (!parsed) {
    return emptyResult("AI response could not be parsed as valid JSON — treated as unverified.", result.generationId);
  }

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
    primarySourceUrl: primaryFetched?.finalUrl ?? null,
    secondarySourceUrl: secondaryFetched?.finalUrl ?? null,
    verificationConfidence: parsed.verificationConfidence,
    claimsChecked: parsed.claimsChecked,
    notes: parsed.notes,
    draft: parsed.draft,
    originalityScore,
    generationId: result.generationId,
  };
}
