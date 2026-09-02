import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_VIEW_DISCOVERY } from "@/lib/permissions";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { DiscoveryStatus, Prisma, SourceTier } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const ALL_STATUSES: DiscoveryStatus[] = [
  "NEW", "REVIEWING", "VERIFIED", "DUPLICATE", "POSSIBLE_DUPLICATE", "REJECTED", "CONVERTED_TO_DRAFT",
];
const ALL_TIERS: SourceTier[] = ["TIER_1", "TIER_2", "TIER_3"];

const SINCE_OPTIONS: Record<string, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "3d": 3 * 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

interface SearchParams {
  status?: string;
  category?: string;
  tier?: string;
  minRelevance?: string;
  sort?: string;
  since?: string;
  page?: string;
}

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!CAN_VIEW_DISCOVERY.includes(user.role)) redirect("/admin");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  const where: Prisma.SourceItemWhereInput = {};
  if (sp.status && ALL_STATUSES.includes(sp.status as DiscoveryStatus)) where.status = sp.status as DiscoveryStatus;
  else where.status = { notIn: ["REJECTED"] }; // default view hides rejected noise
  if (sp.category) where.categoryId = sp.category;
  if (sp.tier && ALL_TIERS.includes(sp.tier as SourceTier)) where.source = { tier: sp.tier as SourceTier };
  if (sp.minRelevance) where.pakistanRelevance = { gte: Number(sp.minRelevance) };
  if (sp.since && sp.since in SINCE_OPTIONS) where.publishedAt = { gte: new Date(Date.now() - SINCE_OPTIONS[sp.since]) };

  // Newest-first by original publication time is the default — createdAt
  // (when TEKZARO discovered it) is a different, less editorially useful
  // signal. Priority-score sort stays available as an alternate view.
  const sort = sp.sort === "priority" ? "priority" : "published";
  const orderBy: Prisma.SourceItemOrderByWithRelationInput[] =
    sort === "priority" ? [{ priorityScore: "desc" }] : [{ publishedAt: "desc" }, { id: "desc" }];

  const [items, total] = await Promise.all([
    prisma.sourceItem.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { source: true, category: true, cluster: { include: { _count: { select: { items: true } } } } },
    }),
    prisma.sourceItem.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">News Discovery</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Nothing here is published automatically — every item requires a human decision.
      </p>

      <form className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-paper-raised p-4 sm:grid-cols-3 lg:grid-cols-5">
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="">All except rejected</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="tier" defaultValue={sp.tier ?? ""} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="">All source tiers</option>
          {ALL_TIERS.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        <select name="minRelevance" defaultValue={sp.minRelevance ?? ""} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="">Any Pakistan relevance</option>
          <option value="50">50+</option>
          <option value="70">70+</option>
        </select>
        <select name="since" defaultValue={sp.since ?? ""} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="">Any time</option>
          <option value="15m">Last 15 minutes</option>
          <option value="1h">Last hour</option>
          <option value="6h">Last 6 hours</option>
          <option value="24h">Last 24 hours</option>
          <option value="3d">Last 3 days</option>
          <option value="7d">Last 7 days</option>
        </select>
        <select name="sort" defaultValue={sort} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="published">Newest published first</option>
          <option value="priority">Priority score</option>
        </select>
        <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft dark:text-paper">
          Apply
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Headline</th>
              <th className="p-3">Source</th>
              <th className="p-3">Category</th>
              <th className="p-3">Published</th>
              <th className="p-3">Priority</th>
              <th className="p-3">PK relevance</th>
              <th className="p-3">Dup. score</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-paper">
                <td className="max-w-xs p-3">
                  <Link href={`/admin/discovery/${item.id}`} className="font-medium text-accent hover:underline">
                    {item.headline}
                  </Link>
                  {item.cluster && item.cluster._count.items > 1 && (
                    <p className="text-xs text-ink-muted">
                      <Link href={`/admin/discovery/clusters/${item.clusterId}`} className="hover:underline">
                        {item.cluster._count.items} sources reporting this
                      </Link>
                    </p>
                  )}
                </td>
                <td className="p-3 text-ink-soft">
                  {item.source.name} <span className="text-xs text-ink-muted">({item.source.tier.replace("_", " ")})</span>
                </td>
                <td className="p-3 text-ink-soft">{item.category?.name ?? "—"}</td>
                <td className="p-3 text-ink-muted">
                  {item.publishedAt ? (
                    <time dateTime={item.publishedAt.toISOString()} title={item.publishedAt.toLocaleString()}>
                      {formatRelativeTime(item.publishedAt)}
                    </time>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3">{item.priorityScore.toFixed(0)}</td>
                <td className="p-3">{item.pakistanRelevance > 0 ? `${item.pakistanRelevance} (${item.pakistanImpactLevel})` : "—"}</td>
                <td className="p-3">{item.duplicateScore > 0 ? item.duplicateScore.toFixed(2) : "—"}</td>
                <td className="p-3">
                  <span className="rounded bg-paper px-2 py-0.5 text-xs font-semibold">{item.status.replace(/_/g, " ")}</span>
                </td>
                <td className="p-3 text-right">
                  <Link href={`/admin/discovery/${item.id}`} className="font-semibold text-accent hover:underline">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-ink-muted">
                  No discovery items match these filters. Fetch a source to populate this queue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <p className="mt-3 text-center text-sm text-ink-muted">
          Page {page} of {totalPages}
        </p>
      )}
    </div>
  );
}
