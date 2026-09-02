import "server-only";
import { prisma } from "../prisma";
import { logSystemEvent } from "../monitoring";

export const DISCOVERY_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface DiscoveryCleanupSummary {
  checked: number;
  expired: number;
  removed: number;
  scheduledProtected: number;
  publishedRemoved: number;
  /** Count of the (at most 2) bulk delete batches that failed outright —
   * see the note on batch-level vs. row-level failure below. */
  failed: number;
}

/**
 * News Discovery is a temporary working queue, not permanent storage — a
 * SourceItem is removed once it's no longer actionable there:
 *
 *   no article yet, or a DRAFT/IN_REVIEW/etc. article -> removed once its
 *     24h retention window (from SourceItem.createdAt, the existing
 *     "when this was fetched" timestamp — no new column needed) has passed
 *   SCHEDULED article                                 -> always protected,
 *     regardless of age, enforced here server-side (never left to the UI)
 *   PUBLISHED article                                 -> removed regardless
 *     of age, the moment this sweep next runs — "immediate" in practice
 *     means the next cron tick (this codebase has no job queue to hook a
 *     truly synchronous per-publish-call-site removal into, and duplicating
 *     that hook across every place an Article can become PUBLISHED — the
 *     auto-publish path, the manual transition action, and the
 *     scheduled-publish cron — would be a real drift risk; one sweep, run
 *     on the existing verify-and-publish cadence, is the safer design)
 *
 * Removing a SourceItem NEVER touches the Article it was converted to —
 * convertedArticleId is a plain FK on SourceItem, not the other way
 * around, so the Article, its StoryCluster, Claims, and ArticleSource
 * provenance rows are structurally untouched by this.
 *
 * Uses two bulk deleteMany() calls, not a per-row loop — production's
 * first real backlog under this rule was 1,300+ eligible rows (this ran
 * for years without ever being cleaned up before), and a one-row-at-a-time
 * loop over that is minutes of sequential round-trips for no real benefit:
 * every relation SourceItem participates in is ON DELETE CASCADE or SET
 * NULL (verified against the schema — SourceItem.source cascades,
 * ClaimSource.sourceItem cascades, SourceItem.duplicateOfId sets null),
 * never RESTRICT, so there is no per-row constraint failure a bulk
 * statement could hit that a row-by-row loop would have avoided. The
 * trade-off: failure isolation is per-batch (at most 2), not per-row — if
 * one of the two bulk deletes itself throws (e.g. a transient connection
 * error), it's recorded and the other still runs, but a single row inside
 * a successful batch can't independently fail the way a true per-item
 * loop's could. Never throws.
 */
export async function cleanupExpiredDiscoveryItems(): Promise<DiscoveryCleanupSummary> {
  const cutoff = new Date(Date.now() - DISCOVERY_RETENTION_MS);

  const [expired, publishedLinked, scheduledProtected] = await Promise.all([
    prisma.sourceItem.count({ where: { createdAt: { lte: cutoff } } }),
    prisma.sourceItem.count({ where: { convertedArticle: { status: "PUBLISHED" } } }),
    prisma.sourceItem.count({ where: { convertedArticle: { status: "SCHEDULED" } } }),
  ]);

  let removed = 0;
  let failed = 0;

  // Published: removed regardless of age. Runs first so the second batch
  // below never has to reconsider rows this one already took.
  try {
    const result = await prisma.sourceItem.deleteMany({ where: { convertedArticle: { status: "PUBLISHED" } } });
    removed += result.count;
  } catch (err) {
    failed++;
    await logCleanupFailure("published-linked batch", err);
  }

  // Everything else past the retention window, except items protected by
  // a SCHEDULED article — enforced here, not left to the caller/UI.
  try {
    const result = await prisma.sourceItem.deleteMany({
      where: { createdAt: { lte: cutoff }, NOT: { convertedArticle: { status: "SCHEDULED" } } },
    });
    removed += result.count;
  } catch (err) {
    failed++;
    await logCleanupFailure("expired non-scheduled batch", err);
  }

  return {
    checked: expired + publishedLinked,
    expired,
    removed,
    scheduledProtected,
    publishedRemoved: publishedLinked,
    failed,
  };
}

async function logCleanupFailure(batch: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await logSystemEvent({
    level: "WARN",
    source: "discovery.cleanup",
    message: `Discovery cleanup's ${batch} failed: ${message}`,
    context: { batch },
  });
}
