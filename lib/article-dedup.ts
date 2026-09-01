import "server-only";
import { prisma } from "./prisma";
import { logAction } from "./audit";
import { logSystemEvent } from "./monitoring";
import { getSystemUserId } from "./system-actor";
import type { ArticleStatus } from "@prisma/client";

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

// Editorial-progress order — a duplicate further along the workflow (or
// already live) is always kept over an earlier-stage sibling, since
// undoing a publish/approval is real editorial exposure, not just row
// cleanup. Ties (e.g. two DRAFTs) fall back to createdAt — the earlier one
// is treated as the original.
const STATUS_PRIORITY: Record<ArticleStatus, number> = {
  PUBLISHED: 0,
  SCHEDULED: 1,
  APPROVED: 2,
  IN_REVIEW: 3,
  CHANGES_REQUESTED: 4,
  DRAFT: 5,
  ARCHIVED: 6,
  REJECTED: 7,
};

interface DedupCandidate {
  id: string;
  title: string;
  status: ArticleStatus;
  categoryId: string;
  createdAt: Date;
}

export function pickDuplicateKeeper<T extends DedupCandidate>(articles: T[]): { keep: T; remove: T[] } {
  const sorted = [...articles].sort((a, b) => {
    const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const [keep, ...remove] = sorted;
  return { keep, remove };
}

/**
 * Finds articles that are near-certainly the same underlying story — same
 * category, same title once case/whitespace-normalized — and deletes every
 * one except a single keeper (see pickDuplicateKeeper). Real production
 * trigger: the auto-publish pipeline has drafted the same widely-syndicated
 * story more than once across separate runs (different SourceItems, same
 * headline). Deliberately conservative — exact-title-match only within the
 * last 30 days, never a fuzzy similarity heuristic that could misfire and
 * delete two genuinely different stories that happen to share wording.
 * Called from the verify-and-publish cron (app/api/cron/verify-and-publish)
 * after each batch, not from processVerificationBatch itself, so its own
 * test suite's exact-count expectations stay untouched by this.
 */
export async function deduplicateArticles(): Promise<{ groupsFound: number; articlesDeleted: number }> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const articles = await prisma.article.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, title: true, status: true, categoryId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, DedupCandidate[]>();
  for (const article of articles) {
    const key = `${article.categoryId}::${normalizeTitle(article.title)}`;
    const group = groups.get(key);
    if (group) group.push(article);
    else groups.set(key, [article]);
  }

  let groupsFound = 0;
  let articlesDeleted = 0;
  let systemUserId: string | null = null;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    groupsFound++;
    const { keep, remove } = pickDuplicateKeeper(group);
    systemUserId ??= await getSystemUserId();

    for (const article of remove) {
      await prisma.article.delete({ where: { id: article.id } });
      articlesDeleted++;
      await logAction({
        userId: systemUserId,
        action: "article_deduplicated",
        entityType: "Article",
        entityId: article.id,
        metadata: { title: article.title, statusAtDeletion: article.status, keptArticleId: keep.id },
      });
    }
  }

  if (articlesDeleted > 0) {
    await logSystemEvent({
      level: "INFO",
      source: "article-dedup",
      message: `Removed ${articlesDeleted} duplicate article(s) across ${groupsFound} group(s).`,
      context: { groupsFound, articlesDeleted },
    });
  }

  return { groupsFound, articlesDeleted };
}
