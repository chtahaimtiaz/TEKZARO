"use server";

import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_EDIT_ANY } from "./permissions";
import { runTask, NEWSROOM_SYSTEM_PROMPT } from "./ai/tasks";
import { isSynthesizableBlock } from "./ai/synthesizable-blocks";
import { logAction } from "./audit";
import { asArticleContent } from "./content-blocks";
import type { ContentBlock } from "./content-blocks";
import type { Prisma } from "@prisma/client";

export interface UrduActionResult {
  ok: boolean;
  message: string;
}

const RESPONSE_SCHEMA_INSTRUCTIONS = `
Respond with ONLY a single JSON object — no markdown code fences, no commentary before or after. Exact shape:
{
  "title": "Urdu translation of the headline",
  "dek": "Urdu translation of the subtitle (empty string if there was none)",
  "blocks": [ same array shape as the input blocks, each "text"/"items" string translated to Urdu, "type"/"level"/"style" fields unchanged ],
  "metaDescription": "Urdu translation of the meta description",
  "socialTitle": "Urdu translation of the social/share title (or the title again if there was none)",
  "socialDescription": "Urdu translation of the social/share description (or the metaDescription again if there was none)"
}
Rules:
- Write natural, fluent Pakistani Urdu — never a stiff word-for-word translation. A native Urdu-reading tech-news audience should find this unremarkable, not machine-translated.
- Preserve every fact, name, number, date, and quotation exactly — this is a faithful representation of already-verified English content, never an opportunity to add, infer, or embellish a claim that wasn't in the source.
- Do NOT translate product, company, or brand names (e.g. OpenAI, Apple, Google, iPhone, Windows, Android, NVIDIA stay exactly as written). Technical terms may mix Urdu and English naturally, the way a Pakistani tech publication actually writes — don't force an awkward pure-Urdu neologism where the English term is what readers actually recognize.
- Preserve the article's structure exactly: the same number of blocks, in the same order, with the same type/level/style — only the human-readable text changes language.
- Keep URLs, code snippets, and numerals as they are.
`.trim();

interface ParsedTranslation {
  title: string;
  dek: string;
  blocks: ContentBlock[];
  metaDescription: string;
  socialTitle: string;
  socialDescription: string;
}

function parseTranslationOutput(text: string): ParsedTranslation | null {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.title !== "string" || obj.title.trim().length === 0) return null;
  if (!Array.isArray(obj.blocks) || obj.blocks.length === 0 || !obj.blocks.every(isSynthesizableBlock)) return null;

  return {
    title: obj.title,
    dek: typeof obj.dek === "string" ? obj.dek : "",
    blocks: obj.blocks as ContentBlock[],
    metaDescription: typeof obj.metaDescription === "string" ? obj.metaDescription : "",
    socialTitle: typeof obj.socialTitle === "string" ? obj.socialTitle : obj.title,
    socialDescription: typeof obj.socialDescription === "string" ? obj.socialDescription : "",
  };
}

/**
 * Generates (or regenerates) the Urdu translation for one article. Never
 * touches the English Article row, never re-verifies or re-sources
 * anything — it translates the already-published/verified English content
 * as-is. On any failure (AI not configured, call failed, unparseable
 * response) the translation row is marked FAILED with a reason and this
 * returns a result describing that; the English article is completely
 * unaffected either way, and this never throws.
 */
async function generateTranslation(params: { requestedById: string; articleId: string }): Promise<UrduActionResult> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: params.articleId },
    select: { title: true, subheadline: true, content: true, metaDescription: true, excerpt: true, slug: true },
  });

  await prisma.articleTranslation.update({ where: { articleId: params.articleId }, data: { status: "GENERATING" } });

  const blocks = asArticleContent(article.content).blocks;
  const userPrompt = [
    `Title: ${article.title}`,
    `Subtitle: ${article.subheadline ?? "(none)"}`,
    `Meta description: ${article.metaDescription ?? article.excerpt ?? "(none)"}`,
    `Content blocks (JSON): ${JSON.stringify(blocks)}`,
    ``,
    RESPONSE_SCHEMA_INSTRUCTIONS,
  ].join("\n");

  const result = await runTask({
    task: "TRANSLATE_URDU",
    requestedById: params.requestedById,
    inputRef: { articleId: params.articleId },
    systemPrompt: `${NEWSROOM_SYSTEM_PROMPT}\n\nYou are translating already-verified TEKZARO articles into natural Pakistani Urdu for a bilingual audience. You never verify, source, or fact-check — that already happened in English.\n\n${RESPONSE_SCHEMA_INSTRUCTIONS}`,
    userPrompt,
  });

  if (!result.ok || !result.text) {
    const failureReason = result.notConfigured
      ? "Urdu translation unavailable until an AI provider is configured."
      : `Translation failed: ${result.error ?? "unknown error"}`;
    await prisma.articleTranslation.update({
      where: { articleId: params.articleId },
      data: { status: "FAILED", failureReason, generationId: result.generationId },
    });
    return { ok: false, message: failureReason };
  }

  const parsed = parseTranslationOutput(result.text);
  if (!parsed) {
    const failureReason = "AI response could not be parsed as valid translated content.";
    await prisma.articleTranslation.update({
      where: { articleId: params.articleId },
      data: { status: "FAILED", failureReason, generationId: result.generationId },
    });
    return { ok: false, message: failureReason };
  }

  await prisma.articleTranslation.update({
    where: { articleId: params.articleId },
    data: {
      status: "READY",
      title: parsed.title,
      // Same slug as the English article — /ur/<slug> — always
      // collision-free since Article.slug is already unique and each
      // Article has at most one translation.
      slug: article.slug,
      dek: parsed.dek || null,
      content: { blocks: parsed.blocks } as unknown as Prisma.InputJsonValue,
      seoTitle: parsed.title,
      metaDescription: parsed.metaDescription || null,
      socialTitle: parsed.socialTitle || null,
      socialDescription: parsed.socialDescription || null,
      generationId: result.generationId,
      generatedAt: new Date(),
      manuallyEdited: false,
      failureReason: null,
    },
  });

  return { ok: true, message: "Urdu translation generated." };
}

async function requireEditor() {
  const sessionUser = await getSessionUser();
  return requireRole(sessionUser, CAN_EDIT_ANY);
}

/** Requests a first-time Urdu translation. Creates the ArticleTranslation
 * row if it doesn't exist yet, then generates. Safe to call again on an
 * existing NOT_REQUESTED/FAILED translation — it's just a regenerate with
 * nothing manually edited yet to protect. */
export async function requestUrduTranslationAction(articleId: string): Promise<UrduActionResult> {
  const user = await requireEditor();

  await prisma.articleTranslation.upsert({
    where: { articleId },
    update: { status: "QUEUED" },
    create: { articleId, status: "QUEUED" },
  });
  await logAction({ userId: user.id, action: "urdu_translation_requested", entityType: "Article", entityId: articleId });

  return generateTranslation({ requestedById: user.id, articleId });
}

/** Regenerates an existing translation. If it was manually edited, this
 * refuses unless confirmOverwrite is true — a manual edit is never
 * silently discarded. */
export async function regenerateUrduTranslationAction(articleId: string, confirmOverwrite: boolean): Promise<UrduActionResult> {
  const user = await requireEditor();

  const existing = await prisma.articleTranslation.findUnique({ where: { articleId }, select: { manuallyEdited: true } });
  if (existing?.manuallyEdited && !confirmOverwrite) {
    return { ok: false, message: "This Urdu translation has manual edits — check “Overwrite manual edits” to confirm regenerating it." };
  }

  await prisma.articleTranslation.update({ where: { articleId }, data: { status: "QUEUED" } });
  await logAction({ userId: user.id, action: "urdu_translation_regenerated", entityType: "Article", entityId: articleId });

  return generateTranslation({ requestedById: user.id, articleId });
}

export interface UpdateUrduTranslationInput {
  title: string;
  dek: string;
  seoTitle: string;
  metaDescription: string;
  socialTitle: string;
  socialDescription: string;
  blocks: ContentBlock[];
}

export async function updateUrduTranslationAction(articleId: string, input: UpdateUrduTranslationInput): Promise<UrduActionResult> {
  const user = await requireEditor();

  const title = input.title.trim();
  if (!title) return { ok: false, message: "Urdu title is required." };
  if (input.blocks.length === 0 || !input.blocks.every(isSynthesizableBlock)) {
    return { ok: false, message: "Urdu content is invalid or empty." };
  }

  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId }, select: { slug: true } });
  const current = await prisma.articleTranslation.findUnique({ where: { articleId }, select: { status: true } });

  const data = {
    title,
    slug: article.slug,
    dek: input.dek.trim() || null,
    content: { blocks: input.blocks } as unknown as Prisma.InputJsonValue,
    seoTitle: input.seoTitle.trim() || null,
    metaDescription: input.metaDescription.trim() || null,
    socialTitle: input.socialTitle.trim() || null,
    socialDescription: input.socialDescription.trim() || null,
    manuallyEdited: true,
    lastEditedAt: new Date(),
    lastEditedById: user.id,
  };

  await prisma.articleTranslation.upsert({
    where: { articleId },
    // A manual edit always leaves the translation with real, human-vetted
    // content — promote it out of NOT_REQUESTED/QUEUED/FAILED, but never
    // downgrade an already-PUBLISHED translation just because it was edited.
    update: { ...data, status: current?.status === "PUBLISHED" ? "PUBLISHED" : "READY" },
    create: { articleId, ...data, status: "READY" },
  });

  await logAction({ userId: user.id, action: "urdu_translation_edited", entityType: "Article", entityId: articleId });
  return { ok: true, message: "Urdu translation saved." };
}

/** Publishing Urdu independently requires the English article itself to
 * already be PUBLISHED — Urdu can never go live ahead of, or instead of,
 * English verification/publication. */
export async function publishUrduTranslationAction(articleId: string): Promise<UrduActionResult> {
  const user = await requireEditor();

  const [article, translation] = await Promise.all([
    prisma.article.findUnique({ where: { id: articleId }, select: { status: true } }),
    prisma.articleTranslation.findUnique({ where: { articleId } }),
  ]);

  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, message: "The English article must be published before its Urdu translation can be published." };
  }
  if (!translation || !translation.title || !translation.content) {
    return { ok: false, message: "Generate or write the Urdu translation before publishing it." };
  }

  await prisma.articleTranslation.update({ where: { articleId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await logAction({ userId: user.id, action: "urdu_translation_published", entityType: "Article", entityId: articleId });
  return { ok: true, message: "Urdu translation published." };
}

export async function unpublishUrduTranslationAction(articleId: string): Promise<UrduActionResult> {
  const user = await requireEditor();

  await prisma.articleTranslation.update({ where: { articleId }, data: { status: "READY", publishedAt: null } });
  await logAction({ userId: user.id, action: "urdu_translation_unpublished", entityType: "Article", entityId: articleId });
  return { ok: true, message: "Urdu translation unpublished." };
}
