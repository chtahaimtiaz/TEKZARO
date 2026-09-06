import "server-only";
import { prisma } from "../prisma";
import { runStructuredTask, NEWSROOM_SYSTEM_PROMPT } from "./tasks";
import { EDITORIAL_STANDARD } from "./editorial-standard";
import { classifyRichness, type EvidenceBundle, type EvidenceDocument } from "./evidence";
import { extractNumericClaims } from "./claim-extraction";
import { isSynthesizableBlock } from "./synthesizable-blocks";
import { BLOCK_SHAPE_EXAMPLE, BLOCK_SHAPE_RULES } from "./block-schema-doc";
import { stripInlineRichText } from "../editor/inline-rich-text";
import type { ContentBlock } from "../content-blocks";

/**
 * "Improve Article" — AI assistance on an article that already exists,
 * distinct from Discovery synthesis. Two safety rules make this different
 * from writing a fresh draft:
 *
 * 1. Evidence comes from what was actually used to write the article
 *    already on file (its persisted EvidenceRecord rows from the original
 *    generation), never freshly re-imagined — an improvement pass must
 *    ground itself in the same facts the article was built from.
 * 2. The model is explicitly forbidden from adding new facts, and that
 *    instruction is checked, not just requested: numeric claims are
 *    extracted from both the original and the improved draft against the
 *    same evidence, and if the improved version has MORE unsupported
 *    claims than the original, the improvement is rejected outright rather
 *    than applied — the same claim-extraction machinery the synthesis
 *    pipeline uses to check the model, not something the model self-reports.
 */

export interface ImprovableArticle {
  title: string;
  excerpt: string;
  blocks: ContentBlock[];
}

export interface ImproveArticleResult {
  ok: boolean;
  draft?: ImprovableArticle;
  generationId?: string;
  /** Set when the model DID produce a structurally valid draft, but it was
   * rejected for introducing more unsupported claims than the original —
   * distinct from a plain pipeline failure, so the caller can explain
   * exactly why nothing was applied. */
  rejectedForNewUnsupportedClaims?: boolean;
  error?: string;
}

/** Rebuilds an EvidenceBundle from what was actually persisted for this
 * article's most recent generation — never re-fetched, so "improve" always
 * grounds itself in exactly the material the article was originally built
 * from, not a new scrape that could disagree with it. Returns a bundle with
 * zero documents (not null) when nothing was ever persisted for this
 * article — e.g. a manually authored article with no AI generation history
 * — so callers get a uniform, always-concrete EvidenceBundle to reason
 * about, same convention lib/verification-actions.ts already uses. */
export async function buildEvidenceBundleFromArticle(articleId: string): Promise<EvidenceBundle> {
  const records = await prisma.evidenceRecord.findMany({
    where: { articleId },
    orderBy: { rank: "asc" },
  });

  const documents: EvidenceDocument[] = records
    .filter((r) => r.extractedText && r.extractedText.length > 0)
    .map((r) => ({
      url: r.url,
      hostname: r.hostname,
      rank: r.rank,
      rankLabel: r.rankLabel,
      title: r.title,
      author: r.author,
      publishedAt: r.publishedAt,
      text: r.extractedText!,
      isOriginatingOutlet: r.isOriginatingOutlet,
    }));

  const totalChars = documents.reduce((n, d) => n + d.text.length, 0);
  const primary = records.find((r) => r.isPrimary);
  const corroborating = records.find((r) => r.isCorroborating);

  return {
    documents,
    richness: classifyRichness(documents, totalChars),
    totalChars,
    primary: primary ? (documents.find((d) => d.url === primary.url) ?? null) : null,
    corroborating: corroborating ? (documents.find((d) => d.url === corroborating.url) ?? null) : null,
    notes: documents.length === 0 ? ["No evidence was persisted for this article's original generation."] : [],
  };
}

const RESPONSE_SCHEMA_INSTRUCTIONS = `
Respond with ONLY a single JSON object — no markdown code fences, no commentary before or after. Exact shape:
{
  "headline": "the article's headline, unchanged unless a genuine improvement is warranted",
  "excerpt": "the standfirst/dek",
  "blocks": ${BLOCK_SHAPE_EXAMPLE}
}
Rules:
- You are IMPROVING an existing article's writing quality — tightening prose, clarifying structure, strengthening headings, improving flow. You are not writing a new article from scratch.
- You MUST NOT introduce any fact, figure, name, date, quote, or specification that does not already appear in the CURRENT ARTICLE below or in the SOURCE EVIDENCE below. If the current article already contains a claim the evidence doesn't support, you may keep it as-is or remove it, but never add a new one.
- If the current draft is already good, make only the improvements that are genuinely warranted — do not rewrite for the sake of rewriting.
${BLOCK_SHAPE_RULES}
`.trim();

interface RawImprovedDraft {
  headline: string;
  excerpt: string;
  blocks: ContentBlock[];
}

function validateImprovedDraft(value: unknown): RawImprovedDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.headline !== "string" || obj.headline.trim().length === 0) return null;
  if (typeof obj.excerpt !== "string") return null;
  if (!Array.isArray(obj.blocks) || obj.blocks.length === 0 || !obj.blocks.every(isSynthesizableBlock)) return null;
  return { headline: obj.headline, excerpt: obj.excerpt, blocks: obj.blocks as ContentBlock[] };
}

function formatCurrentArticle(article: ImprovableArticle): string {
  // Marks (**bold**, _italic_, [text](url)) are stripped before this reaches
  // the model — it was never told about that syntax in any prompt, so
  // showing it raw risks the model treating the markers as literal text to
  // preserve rather than formatting to disregard.
  const blockText = (b: ContentBlock): string => {
    if (b.type === "heading") return `\n## ${stripInlineRichText(b.text)}\n`;
    if (b.type === "list") return b.items.map((i) => `- ${stripInlineRichText(i)}`).join("\n");
    if (b.type === "quote") return `> ${stripInlineRichText(b.text)}`;
    if (b.type === "fact-table") return b.rows.map((r) => `| ${r.label} | ${r.value} |`).join("\n");
    if (b.type === "faq") return b.items.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n\n");
    return "text" in b ? stripInlineRichText(b.text) : "";
  };
  return `Headline: ${article.title}\nExcerpt: ${article.excerpt}\n\n${article.blocks.map(blockText).join("\n")}`;
}

function formatEvidenceForImprovement(evidence: EvidenceBundle): string {
  if (evidence.documents.length === 0) {
    return "No source evidence was persisted for this article. You may only reorganise and clarify the CURRENT ARTICLE's existing content — do not add anything not already stated in it.";
  }
  return evidence.documents
    .map((d, i) => `SOURCE ${i + 1} (${d.hostname}):\n${d.text}`)
    .join("\n\n=====\n\n");
}

export async function improveArticleDraft(params: {
  requestedById: string;
  articleId: string;
  current: ImprovableArticle;
  evidence: EvidenceBundle;
}): Promise<ImproveArticleResult> {
  const userPrompt = [
    "CURRENT ARTICLE:",
    formatCurrentArticle(params.current),
    "",
    "SOURCE EVIDENCE:",
    formatEvidenceForImprovement(params.evidence),
    "",
    RESPONSE_SCHEMA_INSTRUCTIONS,
  ].join("\n");

  const result = await runStructuredTask({
    task: "SYNTHESIZE_ARTICLE",
    requestedById: params.requestedById,
    inputRef: { improveArticleId: params.articleId },
    systemPrompt: `${NEWSROOM_SYSTEM_PROMPT}\n\n${EDITORIAL_STANDARD}\n\n${RESPONSE_SCHEMA_INSTRUCTIONS}`,
    userPrompt,
    validate: validateImprovedDraft,
  });

  if (!result.ok || !result.data) {
    return { ok: false, generationId: result.generationId, error: result.notConfigured ? "AI assistance is not configured." : (result.error ?? "Could not generate an improved draft.") };
  }

  // The safety check this whole feature exists for: does the improved
  // version claim MORE numeric facts than the evidence (and the original)
  // can support? A model told not to invent facts can still slip one in —
  // this catches that mechanically rather than trusting the instruction.
  const originalUnsupported = extractNumericClaims(params.current.blocks, params.evidence).filter((c) => c.claimType === "UNSUPPORTED").length;
  const improvedUnsupported = extractNumericClaims(result.data.blocks, params.evidence).filter((c) => c.claimType === "UNSUPPORTED").length;

  if (improvedUnsupported > originalUnsupported) {
    return {
      ok: false,
      generationId: result.generationId,
      rejectedForNewUnsupportedClaims: true,
      error: `The improved draft introduced ${improvedUnsupported - originalUnsupported} new figure(s) not supported by the article's evidence, so it was not applied.`,
    };
  }

  return {
    ok: true,
    generationId: result.generationId,
    draft: { title: result.data.headline, excerpt: result.data.excerpt, blocks: result.data.blocks },
  };
}
