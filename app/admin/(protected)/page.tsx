import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getOverviewData() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    statusCounts,
    demoCount,
    categoryCount,
    totalCount,
    recentLogs,
    discoveryStatusCounts,
    discoveryTotal,
    sourcesWithErrors,
    lastIngestedSource,
    pageViews7d,
  ] = await Promise.all([
    prisma.article.groupBy({ by: ["status"], _count: true }),
    prisma.article.count({ where: { isDemo: true } }),
    prisma.category.count(),
    prisma.article.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.sourceItem.groupBy({ by: ["status"], _count: true }),
    prisma.sourceItem.count(),
    prisma.source.count({ where: { lastError: { not: null } } }),
    prisma.source.findFirst({ orderBy: { lastChecked: "desc" }, select: { lastChecked: true } }),
    prisma.pageView.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count]));
  const byDiscoveryStatus = Object.fromEntries(discoveryStatusCounts.map((s) => [s.status, s._count]));

  return {
    total: totalCount,
    drafts: byStatus.DRAFT ?? 0,
    inReview: (byStatus.IN_REVIEW ?? 0) + (byStatus.CHANGES_REQUESTED ?? 0),
    published: byStatus.PUBLISHED ?? 0,
    scheduled: byStatus.SCHEDULED ?? 0,
    demoCount,
    categoryCount,
    recentLogs,
    discovery: {
      total: discoveryTotal,
      new: byDiscoveryStatus.NEW ?? 0,
      duplicates: (byDiscoveryStatus.DUPLICATE ?? 0) + (byDiscoveryStatus.POSSIBLE_DUPLICATE ?? 0),
      rejected: byDiscoveryStatus.REJECTED ?? 0,
      verified: byDiscoveryStatus.VERIFIED ?? 0,
      convertedToDraft: byDiscoveryStatus.CONVERTED_TO_DRAFT ?? 0,
      feedFailures: sourcesWithErrors,
      lastIngestion: lastIngestedSource?.lastChecked ?? null,
    },
    pageViews7d,
  };
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await requireUser();
  const { notice } = await searchParams;
  const data = await getOverviewData();

  const stats = [
    ["Total articles", data.total],
    ["Drafts", data.drafts],
    ["In review", data.inReview],
    ["Published", data.published],
    ["Scheduled", data.scheduled],
    ["Demo articles", data.demoCount],
    ["Categories", data.categoryCount],
  ] as const;

  const discoveryStats = [
    ["Items discovered", data.discovery.total],
    ["New", data.discovery.new],
    ["Verified", data.discovery.verified],
    ["Duplicates flagged", data.discovery.duplicates],
    ["Rejected", data.discovery.rejected],
    ["Converted to drafts", data.discovery.convertedToDraft],
    ["Sources with fetch errors", data.discovery.feedFailures],
  ] as const;

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Welcome, {user.name}</h1>

      {notice && (
        <p role="status" className="mt-4 rounded-md bg-pakistan-soft p-3 text-sm font-medium text-pakistan">
          {notice}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-paper-raised p-5">
            <p className="text-sm text-ink-muted">{label}</p>
            <p className="mt-1 font-serif text-3xl font-bold">{value}</p>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Page views (7 days)</p>
          <p className="mt-1 font-serif text-3xl font-bold">{data.pageViews7d}</p>
          <p className="mt-1 text-xs text-ink-muted">Raw view events, not unique visitors. See Analytics for detail.</p>
        </div>
      </div>

      <section className="mt-8 rounded-xl border border-border bg-paper-raised p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">News Discovery</h2>
          <Link href="/admin/discovery" className="text-sm font-semibold text-accent hover:underline">
            Open discovery queue →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {discoveryStats.map(([label, value]) => (
            <div key={label}>
              <p className="text-sm text-ink-muted">{label}</p>
              <p className="mt-1 font-serif text-2xl font-bold">{value}</p>
            </div>
          ))}
          <div>
            <p className="text-sm text-ink-muted">Last ingestion run</p>
            <p className="mt-1 font-serif text-xl font-bold text-ink-muted">
              {data.discovery.lastIngestion ? data.discovery.lastIngestion.toLocaleString() : "Not configured"}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent activity</h2>
          <Link href="/admin/audit-log" className="text-sm font-semibold text-accent hover:underline">
            View audit log →
          </Link>
        </div>
        {data.recentLogs.length === 0 ? (
          <p className="text-sm text-ink-muted">No activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {data.recentLogs.map((log) => (
              <li key={log.id} className="flex items-center justify-between py-2">
                <span>
                  <strong>{log.user.name}</strong> {log.action.replace(/_/g, " ")} <span className="text-ink-muted">{log.entityType}</span>
                </span>
                <span className="text-ink-muted">{log.createdAt.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-5">
        <h2 className="text-lg font-bold">System state</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Scheduled article publishing runs via <code>/api/cron/publish-scheduled</code> (wired to
          Vercel Cron in <code>vercel.json</code>); feeds are still fetched on demand from Sources,
          not on a schedule. AI assistance requires <code>AI_API_KEY</code>. Email (invites, resets,
          notifications, newsletter) requires <code>SMTP_HOST</code>/<code>PORT</code>/<code>USER</code>
          /<code>PASS</code>. Media uploads use local disk in development; on Vercel they stay
          disabled until a durable object-storage adapter (<code>STORAGE_PROVIDER</code>) is
          configured — see Media.
        </p>
      </section>
    </div>
  );
}
