import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_SOURCES } from "@/lib/permissions";
import { updateSourceAction } from "@/lib/source-actions";
import { FetchNowButton } from "@/components/admin/FetchNowButton";

export const dynamic = "force-dynamic";

const SOURCE_TYPES = ["RSS", "ATOM", "COMPANY_NEWSROOM", "OFFICIAL_BLOG", "API", "OTHER"] as const;
const SOURCE_TIERS = ["TIER_1", "TIER_2", "TIER_3"] as const;

export default async function EditSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_SOURCES.includes(user.role)) redirect("/admin");
  const { id } = await params;
  const { error } = await searchParams;

  const [source, categories] = await Promise.all([
    prisma.source.findUnique({ where: { id } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!source) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Sources</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">{source.name}</h1>
        </div>
        {source.feedUrl && <FetchNowButton sourceId={source.id} />}
      </div>
      <p className="text-sm text-ink-muted">
        Last checked: {source.lastChecked ? source.lastChecked.toLocaleString() : "Never"} · Last success:{" "}
        {source.lastSuccess ? source.lastSuccess.toLocaleString() : "Never"}
      </p>
      {source.lastError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">Last error: {source.lastError}</p>}

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <form action={updateSourceAction.bind(null, source.id)} className="mt-6 grid gap-4 rounded-xl border border-border bg-paper-raised p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Name
          <input name="name" defaultValue={source.name} required className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Website URL
          <input name="url" type="url" defaultValue={source.url} required className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Feed URL (RSS/Atom)
          <input name="feedUrl" type="url" defaultValue={source.feedUrl ?? ""} className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Type
          <select name="type" defaultValue={source.type} className="rounded-md border border-border-strong p-2 bg-paper-raised text-ink">
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tier
          <select name="tier" defaultValue={source.tier} className="rounded-md border border-border-strong p-2 bg-paper-raised text-ink">
            {SOURCE_TIERS.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Default category
          <select name="categoryId" defaultValue={source.categoryId ?? ""} className="rounded-md border border-border-strong p-2 bg-paper-raised text-ink">
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Language
          <input name="language" defaultValue={source.language ?? ""} className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Country / region
          <input name="country" defaultValue={source.country ?? ""} className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Reliability notes
          <textarea name="reliabilityNotes" defaultValue={source.reliabilityNotes ?? ""} rows={3} className="rounded-md border border-border-strong p-2" />
        </label>

        <button type="submit" className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark sm:col-span-2">
          Save changes
        </button>
      </form>
    </div>
  );
}
