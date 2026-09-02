import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_ADS } from "@/lib/permissions";
import { createAdCampaignAction } from "@/lib/ad-actions";
import type { AdPlacement } from "@prisma/client";

export const dynamic = "force-dynamic";

const PLACEMENTS: AdPlacement[] = ["HOMEPAGE_FEED", "CATEGORY_TOP", "ARTICLE_END"];

export default async function NewAdCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ advertiserId?: string; error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_ADS.includes(user.role)) redirect("/admin");
  const { advertiserId, error } = await searchParams;

  const [advertisers, categories] = await Promise.all([
    prisma.advertiser.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Advertising</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">New ad campaign</h1>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {advertisers.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-border-strong bg-paper-raised p-3 text-sm text-ink-muted">
          Add an active advertiser first.
        </p>
      ) : (
        <form action={createAdCampaignAction} className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-paper-raised p-4 text-sm">
          <label className="flex flex-col gap-1">
            Campaign name
            <input name="name" required className="rounded-md border border-border-strong p-2" />
          </label>
          <label className="flex flex-col gap-1">
            Advertiser
            <select name="advertiserId" defaultValue={advertiserId ?? ""} required className="rounded-md border border-border-strong bg-paper-raised p-2 text-ink">
              <option value="" disabled>
                Choose an advertiser…
              </option>
              {advertisers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Placement
            <select name="placement" defaultValue="HOMEPAGE_FEED" className="rounded-md border border-border-strong bg-paper-raised p-2 text-ink">
              {PLACEMENTS.map((p) => (
                <option key={p} value={p}>
                  {p.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Category (optional — leave blank for every category)
            <select name="categoryId" defaultValue="" className="rounded-md border border-border-strong bg-paper-raised p-2 text-ink">
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
              <input type="date" name="startDate" required className="rounded-md border border-border-strong p-2" />
            </label>
            <label className="flex flex-col gap-1">
              End date
              <input type="date" name="endDate" required className="rounded-md border border-border-strong p-2" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            Priority (higher wins when more than one campaign competes for the same slot)
            <input type="number" name="priority" defaultValue={0} min={0} max={100} className="w-32 rounded-md border border-border-strong p-2" />
          </label>
          <button type="submit" className="w-fit rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark dark:text-paper">
            Create campaign
          </button>
        </form>
      )}
    </div>
  );
}
