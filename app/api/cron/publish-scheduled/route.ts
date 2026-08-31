import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { getSystemUserId } from "@/lib/system-actor";
import { snapshotVersion, buildSnapshotFromArticleRow } from "@/lib/article-snapshot";
import { notify } from "@/lib/notifications";
import { logSystemEvent } from "@/lib/monitoring";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Publishes every SCHEDULED article whose scheduledAt has elapsed. Callable
 * by any external scheduler (Vercel Cron via vercel.json, or otherwise) —
 * not locked to Vercel specifically, just gated on CRON_SECRET.
 *
 * Idempotent and race-safe: each article's status flip is a single
 * conditional `updateMany` (compare-and-swap on status:"SCHEDULED"), so if
 * two invocations race on the same article, only the one whose updateMany
 * actually changes a row (`count === 1`) proceeds to side effects
 * (audit log, version snapshot, notification). The loser sees `count:0`
 * and moves on — no double-publish, no duplicate notification or audit row.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defense in depth beyond the bearer-token check, in case CRON_SECRET
  // ever leaks — generous enough not to interfere with a legitimate cadence
  // from Vercel Cron (currently once daily — the Hobby plan disallows a
  // more frequent native cron) or a more frequent external scheduler.
  const ip = await getClientIp();
  const allowed = await checkRateLimit(`cron-publish:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const now = new Date();
  const candidates = await prisma.article.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true },
  });

  let published = 0;
  let failed = 0;
  const systemUserId = await getSystemUserId();

  for (const { id } of candidates) {
    try {
      const article = await prisma.article.findUnique({
        where: { id },
        include: { tags: { include: { tag: true } } },
      });
      if (!article || article.status !== "SCHEDULED") continue; // already handled by a racing invocation

      const publishedAt = article.publishedAt ?? now;
      const result = await prisma.article.updateMany({
        where: { id, status: "SCHEDULED", scheduledAt: { lte: now } },
        data: { status: "PUBLISHED", publishedAt },
      });
      if (result.count !== 1) continue; // lost the race — another invocation already claimed this row

      await snapshotVersion({
        articleId: id,
        editorId: systemUserId,
        status: "PUBLISHED",
        title: article.title,
        snapshot: buildSnapshotFromArticleRow(article),
        changeSummary: "Status changed to PUBLISHED (scheduled publish)",
      });

      await logAction({
        userId: systemUserId,
        action: "article_published",
        entityType: "Article",
        entityId: id,
        metadata: { from: "SCHEDULED", to: "PUBLISHED", trigger: "cron" },
      });

      if (article.createdById) {
        await notify({
          userId: article.createdById,
          type: "article_published",
          title: "Your article was published",
          body: `"${article.title}" was published as scheduled.`,
          link: `/admin/articles/${id}`,
          email: true,
        });
      }

      published += 1;
    } catch (err: unknown) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      await logSystemEvent({
        level: "ERROR",
        source: "cron.publish-scheduled",
        message: `Failed to publish article ${id}: ${message}`,
      });
    }
  }

  await logSystemEvent({
    level: "INFO",
    source: "cron.publish-scheduled",
    message: `Checked ${candidates.length} due article(s): ${published} published, ${failed} failed.`,
    context: { checked: candidates.length, published, failed },
  });

  return NextResponse.json({ checked: candidates.length, published, failed });
}
