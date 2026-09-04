import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_ADS } from "@/lib/permissions";
import { computeAdRuntimeStatus, AD_RUNTIME_STATUS_LABELS, type AdRuntimeStatus } from "@/lib/ads";
import type { AdCampaignStatus, AdPlacement, Prisma } from "@prisma/client";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const ALL_STATUSES: AdCampaignStatus[] = ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PAUSED"];
const ALL_PLACEMENTS: AdPlacement[] = ["HOMEPAGE_FEED", "CATEGORY_TOP", "ARTICLE_END"];

const RUNTIME_BADGE: Record<AdRuntimeStatus, string> = {
  DRAFT: "bg-paper text-ink-muted",
  PENDING_REVIEW: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  REJECTED: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  PAUSED: "bg-paper text-ink-muted",
  SCHEDULED: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ACTIVE: "bg-pakistan-soft text-pakistan",
  EXPIRED: "bg-paper text-ink-muted",
};

export default async function AdCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; placement?: string; error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_ADS.includes(user.role)) redirect("/admin");
  const { status, placement, error } = await searchParams;

  const where: Prisma.AdCampaignWhereInput = {};
  if (status && ALL_STATUSES.includes(status as AdCampaignStatus)) where.status = status as AdCampaignStatus;
  if (placement && ALL_PLACEMENTS.includes(placement as AdPlacement)) where.placement = placement as AdPlacement;

  const campaigns = await prisma.adCampaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { advertiser: { select: { name: true } }, category: { select: { name: true } }, creative: { select: { id: true } } },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Advertising</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">Ad campaigns</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/advertisers" className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold hover:border-accent">
            ← Advertisers
          </Link>
          <Link href="/admin/ad-campaigns/new" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-dark dark:text-paper">
            + New campaign
          </Link>
        </div>
      </div>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <form className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-paper-raised p-4 sm:grid-cols-3">
        <select name="status" defaultValue={status ?? ""} className="rounded-md border border-border-strong bg-paper-raised p-2 text-sm text-ink">
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select name="placement" defaultValue={placement ?? ""} className="rounded-md border border-border-strong bg-paper-raised p-2 text-sm text-ink">
          <option value="">All placements</option>
          {ALL_PLACEMENTS.map((p) => (
            <option key={p} value={p}>
              {p.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold hover:border-accent">
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Name</th>
              <th className="p-3">Advertiser</th>
              <th className="p-3">Placement</th>
              <th className="p-3">Category</th>
              <th className="p-3">Dates</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const runtime = computeAdRuntimeStatus(c);
              return (
                <tr key={c.id} className="border-b border-border last:border-b-0">
                  <td className="p-3 font-medium">
                    <Link href={`/admin/ad-campaigns/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                    {!c.creative && <span className="ml-2 text-xs text-ink-muted">(no creative)</span>}
                  </td>
                  <td className="p-3 text-ink-soft">{c.advertiser.name}</td>
                  <td className="p-3 text-ink-soft">{c.placement.replace(/_/g, " ")}</td>
                  <td className="p-3 text-ink-soft">{c.category?.name ?? "All categories"}</td>
                  <td className="p-3 text-ink-muted">
                    {formatDate(c.startDate)} – {formatDate(c.endDate)}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RUNTIME_BADGE[runtime]}`}>
                      {AD_RUNTIME_STATUS_LABELS[runtime]}
                    </span>
                  </td>
                </tr>
              );
            })}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">
                  No campaigns match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
