"use server";

import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_CREATE_DRAFT_FROM_DISCOVERY } from "./permissions";
import { logAction } from "./audit";
import { verifySourceItem } from "./verification-actions";

export interface WriteWithAIResult {
  ok: boolean;
  articleId?: string;
  published?: boolean;
  error?: string;
  /** True specifically when another generation is already in flight for
   * this item — distinct from a generic failure, so the UI can show
   * "already running" rather than a scary error. */
  alreadyRunning?: boolean;
}

/**
 * The full evidence-first pipeline, triggered by an editor's "Write with AI"
 * click on a Discovery item — source resolution, article extraction,
 * evidence gathering, synthesis, claim verification, the quality gate,
 * image discovery, and draft creation, via verifySourceItem
 * (lib/verification-actions.ts). Never calls the writing model directly:
 * this is a thin, permission-checked, idempotency-guarded wrapper around
 * the same pipeline the batch cron uses.
 *
 * Same function serves both "Write with AI" (first generation for this
 * item) and "Generate New Version" (a repeat call once one already
 * exists) — verifySourceItem doesn't care whether convertedArticleId is
 * already set; it always runs the pipeline and re-points the item at
 * whatever article this call produces. The UI is what labels these two
 * cases differently.
 *
 * Idempotency against a genuinely concurrent second click (or a second
 * browser tab) is a compare-and-swap on SourceItem.aiStatus, the same
 * "an updateMany's affected-row count is the atomic race-winner signal"
 * pattern already used for scheduled publishing — never a read-then-write,
 * which would leave a window for two requests to both see PROCESSING absent
 * and both proceed.
 */
export async function writeWithAIAction(itemId: string): Promise<WriteWithAIResult> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_CREATE_DRAFT_FROM_DISCOVERY);

  const claimed = await prisma.sourceItem.updateMany({
    where: { id: itemId, aiStatus: { not: "PROCESSING" } },
    data: { aiStatus: "PROCESSING" },
  });
  if (claimed.count === 0) {
    return { ok: false, alreadyRunning: true, error: "A generation is already running for this item." };
  }

  try {
    const result = await verifySourceItem({ itemId, actorId: user.id, triggerType: "write_with_ai" });
    await prisma.sourceItem.update({ where: { id: itemId }, data: { aiStatus: result.ok ? "COMPLETE" : "FAILED" } });

    if (!result.ok) {
      return { ok: false, error: result.error ?? "Could not generate a draft for this item." };
    }

    await logAction({
      userId: user.id,
      action: "discovery_write_with_ai",
      entityType: "SourceItem",
      entityId: itemId,
      metadata: { articleId: result.articleId, published: result.published },
    });
    return { ok: true, articleId: result.articleId, published: result.published };
  } catch (err) {
    // Never leave the item stuck reporting PROCESSING forever if the
    // pipeline itself throws — same defense-in-depth posture as every
    // other per-item error boundary in this codebase.
    await prisma.sourceItem.update({ where: { id: itemId }, data: { aiStatus: "FAILED" } }).catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
