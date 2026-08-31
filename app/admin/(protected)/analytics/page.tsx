import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAN_VIEW_ANALYTICS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requireUser();
  if (!CAN_VIEW_ANALYTICS.includes(user.role)) redirect("/admin");

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [views7d, views30d, recentViews, topArticles] = await Promise.all([
    prisma.pageView.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.pageView.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.pageView.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.pageView.groupBy({
      by: ["articleId"],
      where: { createdAt: { gte: thirtyDaysAgo }, articleId: { not: null } },
      _count: true,
      orderBy: { _count: { articleId: "desc" } },
      take: 10,
    }),
  ]);

  const articles = await prisma.article.findMany({
    where: { id: { in: topArticles.map((t) => t.articleId).filter((id): id is string => id !== null) } },
    select: { id: true, title: true, slug: true },
  });
  const articleById = new Map(articles.map((a) => [a.id, a]));

  // Daily bucket, last 14 days — hand-rolled, no charting dependency.
  const dayBuckets: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dayBuckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const v of recentViews) {
    const key = v.createdAt.toISOString().slice(0, 10);
    if (key in dayBuckets) dayBuckets[key] += 1;
  }
  const maxDay = Math.max(1, ...Object.values(dayBuckets));

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Analytics</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Raw page-view counts from every article read — not unique visitors, not deduplicated for
        bots, crawlers, or repeat refreshes. Treat these as directional volume, not audience size.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Page views (7 days)</p>
          <p className="mt-1 font-serif text-3xl font-bold">{views7d}</p>
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Page views (30 days)</p>
          <p className="mt-1 font-serif text-3xl font-bold">{views30d}</p>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-5">
        <h2 className="text-lg font-bold">Daily page views (last 14 days)</h2>
        <div className="mt-4 flex items-end gap-1.5" style={{ height: 120 }}>
          {Object.entries(dayBuckets).map(([day, count]) => (
            <div key={day} className="flex flex-1 flex-col items-center gap-1" title={`${day}: ${count}`}>
              <div
                className="w-full rounded-t bg-accent"
                style={{ height: `${Math.max(2, (count / maxDay) * 100)}%` }}
              />
              <span className="text-[9px] text-ink-muted">{day.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-5">
        <h2 className="text-lg font-bold">Top articles (30 days)</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {topArticles.map((t) => {
            const article = t.articleId ? articleById.get(t.articleId) : null;
            return (
              <li key={t.articleId} className="flex items-center justify-between py-2">
                <span>{article?.title ?? "(deleted article)"}</span>
                <span className="font-semibold">{t._count} views</span>
              </li>
            );
          })}
          {topArticles.length === 0 && <li className="py-2 text-ink-muted">No page views recorded yet.</li>}
        </ul>
      </section>
    </div>
  );
}
