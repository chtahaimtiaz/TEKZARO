import "server-only";
import { prisma } from "../prisma";
import { runTask, NEWSROOM_SYSTEM_PROMPT } from "./tasks";
import { isSearchConfigured, searchWeb } from "../search/web-search";
import { safeFetch } from "../security/safe-fetch";
import type { ContentBlock, ParagraphBlock, HeadingBlock, QuoteBlock, ListBlock } from "../content-blocks";
import type { ArticleVerificationStatus, SourceItem, Source } from "@prisma/client";

export interface VerifyAndSynthesizeResult {
  verificationStatus: ArticleVerificationStatus;
  primarySourceUrl: string | null;
  notes: string;
  draft: { headline: string; excerpt: string; blocks: ContentBlock[] } | null;
  /** Null when no AI call was ever attempted (e.g. search not configured) —
   * distinct from a call that was attempted and failed, which still gets a
   * generationId via runTask's own audit logging. */
  generationId: string | null;
}

const MAX_PRIMARY_SOURCE_CHARS = 6000;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Finds the first search result hosted on a known-official (Source.tier =
 * TIER_1) domain, excluding the discovered item's own source domain (so a
 * story is never "confirmed" against itself). Deliberately deterministic,
 * not LLM-guessed — consistent with this codebase's existing preference for
 * auditable, code-driven classification (tech-relevance, Pakistan-relevance,
 * priority scoring all do this already) — and reuses the TIER_1 curation
 * already done when the source list was built, rather than hand-maintaining
 * a second "official domains" list that could drift out of sync.
 */
async function findPrimarySourceCandidate(
  results: { title: string; url: string; snippet: string }[],
  ownSourceUrl: string,
): Promise<string | null> {
  const tier1 = await prisma.source.findMany({
    where: { tier: "TIER_1", active: true },
    select: { url: true },
  });
  const tier1Hostnames = new Set(tier1.map((s) => hostnameOf(s.url)).filter((h): h is string => h !== null));
  const ownHostname = hostnameOf(ownSourceUrl);

  const match = results.find((r) => {
    const h = hostnameOf(r.url);
    return h !== null && tier1Hostnames.has(h) && h !== ownHostname;
  });
  return match?.url ?? null;
}

function isValidBlock(value: unknown): value is ParagraphBlock | HeadingBlock | QuoteBlock | ListBlock {
  if (typeof value !== "object" || value === null) return false;
  const block = value as Record<string, unknown>;
  switch (block.type) {
    case "paragraph":
    case "quote":
      return typeof block.text === "string" && block.text.trim().length > 0;
    case "heading":
      return typeof block.text === "string" && block.text.trim().length > 0 && (block.level === 2 || block.level === 3);
    case "list":
      return (
        (block.style === "bullet" || block.style === "number") &&
        Array.isArray(block.items) &&
        block.items.length > 0 &&
        block.items.every((i) => typeof i === "string")
      );
    default:
      return false;
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
  notes: string;
  draft: { headline: string; excerpt: string; blocks: ContentBlock[] } | null;
}

/** Parses the model's JSON response defensively — malformed/unexpected
 * shape degrades to null (caller treats that as UNVERIFIED), never throws. */
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

  let draft: ParsedModelOutput["draft"] = null;
  if (obj.draft !== null && typeof obj.draft === "object") {
    const d = obj.draft as Record<string, unknown>;
    if (
      typeof d.headline === "string" &&
      d.headline.trim().length > 0 &&
      typeof d.excerpt === "string" &&
      Array.isArray(d.blocks) &&
      d.blocks.length > 0 &&
      d.blocks.every(isValidBlock)
    ) {
      draft = { headline: d.headline, excerpt: d.excerpt, blocks: d.blocks as ContentBlock[] };
    }
  }

  return {
    verificationStatus: obj.verificationStatus as ArticleVerificationStatus,
    notes: obj.notes,
    draft,
  };
}

const RESPONSE_SCHEMA_INSTRUCTIONS = `
Respond with ONLY a single JSON object — no markdown code fences, no commentary before or after. Exact shape:
{
  "verificationStatus": "PRIMARY_SOURCE_CONFIRMED" | "PRIMARY_SOURCE_NOT_FOUND" | "CONTRADICTION_FOUND" | "UNVERIFIED",
  "notes": "plain-English explanation of your reasoning, for a human editor",
  "draft": null | {
    "headline": "original headline in TEKZARO's own words",
    "excerpt": "1-2 sentence summary",
    "blocks": [ { "type": "paragraph", "text": "..." }, { "type": "heading", "level": 2, "text": "..." }, { "type": "list", "style": "bullet", "items": ["..."] }, { "type": "quote", "text": "...", "cite": "optional" } ]
  }
}
Rules for "draft":
- Write ORIGINAL prose in TEKZARO's own voice. Never copy sentences verbatim from the source material provided — summarize and re-report, don't reproduce.
- Include an inline attribution line naming where this was first reported and, if a primary source was provided, the official source it was verified against (e.g. "According to Samsung's newsroom... TechCrunch first reported this development").
- Set "draft" to null if you don't have enough material to write a genuine, factual article.
- Use "verificationStatus": "PRIMARY_SOURCE_CONFIRMED" ONLY if a primary source's text was actually provided to you below AND it corroborates the story. If no primary source text was provided, you MUST NOT claim PRIMARY_SOURCE_CONFIRMED.
- Use "CONTRADICTION_FOUND" if the primary source's text contradicts the discovered claims.
`.trim();

export async function verifyAndSynthesize(params: {
  requestedById: string;
  item: SourceItem & { source: Source };
}): Promise<VerifyAndSynthesizeResult> {
  const { requestedById, item } = params;

  if (!isSearchConfigured()) {
    return {
      verificationStatus: "UNVERIFIED",
      primarySourceUrl: null,
      notes: "Search not configured (SEARCH_API_KEY / GOOGLE_SEARCH_ENGINE_ID missing) — no verification attempted.",
      draft: null,
      generationId: null,
    };
  }

  let searchResults: { title: string; url: string; snippet: string }[];
  try {
    searchResults = await searchWeb(item.headline);
  } catch (err) {
    return {
      verificationStatus: "UNVERIFIED",
      primarySourceUrl: null,
      notes: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
      draft: null,
      generationId: null,
    };
  }

  const candidateUrl = await findPrimarySourceCandidate(searchResults, item.source.url);

  let primarySourceText: string | null = null;
  let confirmedPrimarySourceUrl: string | null = null;
  if (candidateUrl) {
    try {
      const fetched = await safeFetch(candidateUrl);
      primarySourceText = fetched.text.slice(0, MAX_PRIMARY_SOURCE_CHARS);
      confirmedPrimarySourceUrl = fetched.finalUrl;
    } catch {
      // Unreachable candidate doesn't count as a confirmable primary source
      // for this run — proceed as if none was found, rather than trusting a
      // URL we couldn't actually read.
    }
  }

  const userPrompt = [
    `Discovered story:`,
    `Headline: ${item.headline}`,
    `Summary: ${item.excerpt ?? "(none provided)"}`,
    `Reported by: ${item.source.name} (${item.source.url})`,
    ``,
    primarySourceText
      ? `Primary source text found at ${confirmedPrimarySourceUrl}:\n${primarySourceText}`
      : `No primary/official source could be found or read for this story.`,
    ``,
    RESPONSE_SCHEMA_INSTRUCTIONS,
  ].join("\n");

  const result = await runTask({
    task: "VERIFY_PRIMARY_SOURCE",
    requestedById,
    inputRef: { sourceItemId: item.id, primarySourceUrl: confirmedPrimarySourceUrl },
    systemPrompt: `${NEWSROOM_SYSTEM_PROMPT}\n\n${RESPONSE_SCHEMA_INSTRUCTIONS}`,
    userPrompt,
  });

  if (!result.ok || !result.text) {
    return {
      verificationStatus: "UNVERIFIED",
      primarySourceUrl: null,
      notes: result.notConfigured ? "AI not configured — no verification attempted." : `AI call failed: ${result.error ?? "unknown error"}`,
      draft: null,
      generationId: result.generationId,
    };
  }

  const parsed = parseModelOutput(result.text);
  if (!parsed) {
    return {
      verificationStatus: "UNVERIFIED",
      primarySourceUrl: null,
      notes: "AI response could not be parsed as valid JSON — treated as unverified.",
      draft: null,
      generationId: result.generationId,
    };
  }

  // Deterministic override, not just a prompt instruction: the model cannot
  // have confirmed or contradicted a primary source that was never actually
  // fetched for it to read, regardless of what it claims.
  const verificationStatus: ArticleVerificationStatus = primarySourceText
    ? parsed.verificationStatus
    : "PRIMARY_SOURCE_NOT_FOUND";

  return {
    // confirmedPrimarySourceUrl is only ever non-null when primarySourceText
    // was actually fetched, which is exactly the condition verificationStatus
    // was just derived from above — so this is already consistent whether
    // the primary source confirmed or contradicted the story.
    verificationStatus,
    primarySourceUrl: confirmedPrimarySourceUrl,
    notes: parsed.notes,
    draft: parsed.draft,
    generationId: result.generationId,
  };
}
