"use server";

import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_WRITE } from "./permissions";
import { logAction } from "./audit";
import { snapshotVersion, buildSnapshotFromArticleRow } from "./article-snapshot";
import { improveArticleDraft, buildEvidenceBundleFromArticle } from "./ai/improve-article";
import { runQualityGate } from "./ai/quality-gate";
import { persistEvidenceAndClaims, recordGenerationMetric } from "./ai/generation-persistence";
import { aiModelId } from "./ai/provider";
import type { ContentBlock } from "./content-blocks";
import type { Prisma } from "@prisma/client";

export interface ImproveArticleActionResult {
  ok: boolean;
  error?: string;
}

/**
 * "Improve Article" — AI assistance on an article that already exists
 * (Discovery-generated, manually written, or imported; any of them).
 * Explicit and reversible: the pre-improvement content is snapshotted as a
 * real, restorable ArticleVersion (the same version-history mechanism
 * every other edit already produces) BEFORE anything is changed, so
 * "Restore this version" — already a working feature — undoes it cleanly.
 * There is no separate bespoke "proposal" UI to review a diff in; the
 * improvement is applied directly to the article the editor is already
 * looking at, exactly like an editor's own edit would be, and can be
 * undone the same way any edit can be.
 *
 * Never runs automatically — only from an explicit editor click, and it
 * only ever touches title/excerpt/content; category, author, tags, image
 * and workflow status are untouched.
 */
export async function improveArticleAction(articleId: string): Promise<ImproveArticleActionResult> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_WRITE);

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { tags: { include: { tag: true } } },
  });
  if (!article) return { ok: false, error: "Article not found." };

  const blocks = (article.content as { blocks?: ContentBlock[] } | null)?.blocks ?? [];
  if (blocks.length === 0) return { ok: false, error: "This article has no content to improve yet." };

  const evidence = await buildEvidenceBundleFromArticle(articleId);

  const result = await improveArticleDraft({
    requestedById: user.id,
    articleId,
    current: { title: article.title, excerpt: article.excerpt ?? "", blocks },
    evidence,
  });

  if (!result.ok || !result.draft) {
    return { ok: false, error: result.error ?? "Could not generate an improvement for this article." };
  }

  // Snapshot BEFORE changing anything — this is what makes the action
  // reversible: a real ArticleVersion row an editor can restore from,
  // using the same restore feature every other version already supports.
  await snapshotVersion({
    articleId,
    editorId: user.id,
    status: article.status,
    title: article.title,
    snapshot: buildSnapshotFromArticleRow(article),
    changeSummary: "Before AI-assisted improvement",
  });

  await prisma.article.update({
    where: { id: articleId },
    data: {
      title: result.draft.title,
      excerpt: result.draft.excerpt,
      content: { blocks: result.draft.blocks } as unknown as Prisma.InputJsonValue,
      metaDescription: result.draft.excerpt,
    },
  });

  // The improved content gets its own claim/quality record, linked to the
  // NEW generation this call created — the article's evidence traceability
  // now reflects what is actually live, not only the original synthesis.
  if (result.generationId) {
    const quality = runQualityGate({
      headline: result.draft.title,
      excerpt: result.draft.excerpt,
      blocks: result.draft.blocks,
      evidence,
    });
    await persistEvidenceAndClaims({ generationId: result.generationId, articleId, evidence, claims: quality.claims }).catch(() => {});
    await recordGenerationMetric({
      generationId: result.generationId,
      sourceItemId: null,
      articleId,
      modelId: aiModelId(),
      evidence,
      blocks: result.draft.blocks,
      quality,
      retryCount: 0,
      latencyMs: 0,
      sentToReview: true,
      autoPublished: false,
      rejectionReason: null,
      triggerType: "improve_article",
    }).catch(() => {});
  }

  await logAction({
    userId: user.id,
    action: "article_ai_improved",
    entityType: "Article",
    entityId: articleId,
    metadata: { generationId: result.generationId },
  });

  return { ok: true };
}
