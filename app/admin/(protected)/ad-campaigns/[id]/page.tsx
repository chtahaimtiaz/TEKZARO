import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_ADS } from "@/lib/permissions";
import { isMediaUploadAvailable } from "@/lib/media/storage";
import { computeAdRuntimeStatus, AD_RUNTIME_STATUS_LABELS, getAdCampaignStats } from "@/lib/ads";
import { legalAdTransitionsFor, AD_TRANSITION_LABELS, type AdTransitionName } from "@/lib/ad-workflow";
import {
  updateAdCampaignAction,
  upsertAdCreativeAction,
  submitAdCampaignAction,
  approveAdCampaignAction,
  rejectAdCampaignAction,
  pauseAdCampaignAction,
  resumeAdCampaignAction,
  deleteAdCampaignAction,
} from "@/lib/ad-actions";
import { AdCreativeForm } from "@/components/admin/AdCreativeForm";
import type { AdPlacement } from "@prisma/client";

export const dynamic = "force-dynamic";

const PLACEMENTS: AdPlacement[] = ["HOMEPAGE_FEED", "CATEGORY_TOP", "ARTICLE_END"];

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdCampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_ADS.includes(user.role)) redirect("/admin");
  const { id } = await params;
  const { error } = await searchParams;

  const [campaign, advertisers, categories] = await Promise.all([
    prisma.adCampaign.findUnique({
      where: { id },
      include: { advertiser: true, category: true, creative: true, reviewedBy: { select: { name: true } } },
    }),
    prisma.advertiser.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!campaign) notFound();

  const runtime = computeAdRuntimeStatus(campaign);
  const stats = await getAdCampaignStats(campaign.id);
  const transitions = legalAdTransitionsFor(campaign.status, user.role);
  const uploadAvailable = isMediaUploadAvailable();

  const transitionActions: Record<AdTransitionName, (formData: FormData) => Promise<void>> = {
    submit: async () => submitAdCampaignAction(campaign.id),
    approve: async () => approveAdCampaignAction(campaign.id),
    reject: async (formData: FormData) => rejectAdCampaignAction(campaign.id, formData),
    pause: async () => pauseAdCampaignAction(campaign.id),
    resume: async () => resumeAdCampaignAction(campaign.id),
  };

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Advertising</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">{campaign.name}</h1>
        </div>
        <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold uppercase text-ink-muted">
          {AD_RUNTIME_STATUS_LABELS[runtime]}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{campaign.advertiser.name}</p>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {campaign.status === "REJECTED" && campaign.rejectionReason && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Rejected{campaign.reviewedBy ? ` by ${campaign.reviewedBy.name}` : ""}: {campaign.rejectionReason}
        </p>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-border bg-paper-raised p-3">
          <p className="text-xs text-ink-muted">Impressions</p>
          <p className="mt-1 font-serif text-xl font-bold">{stats.impressions}</p>
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-3">
          <p className="text-xs text-ink-muted">Clicks</p>
          <p className="mt-1 font-serif text-xl font-bold">{stats.clicks}</p>
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-3">
          <p className="text-xs text-ink-muted">CTR</p>
          <p className="mt-1 font-serif text-xl font-bold">{stats.ctr === null ? "—" : `${(stats.ctr * 100).toFixed(1)}%`}</p>
        </div>
      </div>

      {transitions.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {transitions
            .filter((t) => t !== "reject")
            .map((t) => (
              <form key={t} action={transitionActions[t]}>
                <button
                  type="submit"
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                    t === "approve" || t === "resume"
                      ? "bg-accent text-white hover:bg-accent-dark dark:text-paper"
                      : "border border-border-strong hover:border-accent"
                  }`}
                >
                  {AD_TRANSITION_LABELS[t]}
                </button>
              </form>
            ))}
          {transitions.includes("reject") && (
            <form action={transitionActions.reject} className="flex flex-wrap items-center gap-2">
              <input name="rejectionReason" placeholder="Reason (optional)" className="rounded-md border border-border-strong p-1.5 text-sm" />
              <button type="submit" className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold text-red-600 hover:border-red-400 dark:text-red-400">
                Reject
              </button>
            </form>
          )}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold">Creative</h2>
        <p className="mt-1 text-xs text-ink-muted">Approving a campaign requires a creative to already be saved.</p>
        <div className="mt-3">
          <AdCreativeForm
            action={upsertAdCreativeAction.bind(null, campaign.id)}
            available={uploadAvailable}
            initialImageUrl={campaign.creative?.imageUrl}
            initialAltText={campaign.creative?.altText}
            initialTargetUrl={campaign.creative?.targetUrl}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Campaign details</h2>
        <form action={updateAdCampaignAction.bind(null, campaign.id)} className="mt-3 flex flex-col gap-4 rounded-xl border border-border bg-paper-raised p-4 text-sm">
          <label className="flex flex-col gap-1">
            Campaign name
            <input name="name" defaultValue={campaign.name} required className="rounded-md border border-border-strong p-2" />
          </label>
          <label className="flex flex-col gap-1">
            Advertiser
            <select name="advertiserId" defaultValue={campaign.advertiserId} required className="rounded-md border border-border-strong bg-paper-raised p-2 text-ink">
              {advertisers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Placement
            <select name="placement" defaultValue={campaign.placement} className="rounded-md border border-border-strong bg-paper-raised p-2 text-ink">
              {PLACEMENTS.map((p) => (
                <option key={p} value={p}>
                  {p.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Category (optional — leave blank for every category)
            <select name="categoryId" defaultValue={campaign.categoryId ?? ""} className="rounded-md border border-border-strong bg-paper-raised p-2 text-ink">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              Start date
              <input type="date" name="startDate" defaultValue={toDateInputValue(campaign.startDate)} required className="rounded-md border border-border-strong p-2" />
            </label>
            <label className="flex flex-col gap-1">
              End date
              <input type="date" name="endDate" defaultValue={toDateInputValue(campaign.endDate)} required className="rounded-md border border-border-strong p-2" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            Priority
            <input type="number" name="priority" defaultValue={campaign.priority} min={0} max={100} className="w-32 rounded-md border border-border-strong p-2" />
          </label>
          <button type="submit" className="w-fit rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark dark:text-paper">
            Save details
          </button>
        </form>
      </section>

      {campaign.status === "DRAFT" && (
        <form action={deleteAdCampaignAction.bind(null, campaign.id)} className="mt-6">
          <button type="submit" className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400">
            Delete draft campaign
          </button>
        </form>
      )}
    </div>
  );
}
