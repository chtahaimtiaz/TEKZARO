import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_SOURCES } from "@/lib/permissions";
import { createSourceAction } from "@/lib/source-actions";

export const dynamic = "force-dynamic";

const SOURCE_TYPES = ["RSS", "ATOM", "COMPANY_NEWSROOM", "OFFICIAL_BLOG", "API", "OTHER"] as const;
const SOURCE_TIERS = ["TIER_1", "TIER_2", "TIER_3"] as const;

export default async function NewSourcePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_SOURCES.includes(user.role)) redirect("/admin");
  const { error } = await searchParams;

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Sources</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Add a source</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Adding a source does not imply it is reliable — assign a tier honestly based on how much
        independent verification its reporting typically needs.
      </p>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

      <form action={createSourceAction} className="mt-6 grid gap-4 rounded-xl border border-border bg-paper-raised p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Name
          <input name="name" required className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Website URL
          <input name="url" type="url" required placeholder="https://example.com" className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Feed URL (RSS/Atom)
          <input name="feedUrl" type="url" placeholder="https://example.com/feed" className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Type
          <select name="type" className="rounded-md border border-border-strong p-2">
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tier
          <select name="tier" defaultValue="TIER_3" className="rounded-md border border-border-strong p-2">
            {SOURCE_TIERS.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Default category
          <select name="categoryId" className="rounded-md border border-border-strong p-2">
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
          <input name="language" placeholder="en" className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Country / region
          <input name="country" placeholder="Pakistan" className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Reliability notes
          <textarea name="reliabilityNotes" rows={3} placeholder="Why this tier? What to watch for?" className="rounded-md border border-border-strong p-2" />
        </label>

        <button type="submit" className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark sm:col-span-2">
          Add source
        </button>
      </form>
    </div>
  );
}
