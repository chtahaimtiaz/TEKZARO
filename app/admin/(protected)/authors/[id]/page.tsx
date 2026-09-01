import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_AUTHORS } from "@/lib/permissions";
import { updateAuthorAction } from "@/lib/author-actions";

export const dynamic = "force-dynamic";

export default async function EditAuthorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_AUTHORS.includes(user.role)) redirect("/admin");
  const { id } = await params;
  const { error } = await searchParams;

  const [author, categories] = await Promise.all([
    prisma.author.findUnique({ where: { id }, include: { categories: { select: { id: true } } } }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!author) notFound();

  const eligibleCategoryIds = new Set(author.categories.map((c) => c.id));

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">{author.name}</h1>
      <p className="mt-1 text-sm text-ink-muted">/author/{author.slug}</p>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

      <form action={updateAuthorAction.bind(null, author.id)} className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-paper-raised p-4 text-sm">
        <label className="flex flex-col gap-1">
          Name
          <input name="name" defaultValue={author.name} required className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Position
          <input name="position" defaultValue={author.position ?? ""} className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Photo URL
          <input name="photoUrl" defaultValue={author.photoUrl ?? ""} className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Bio
          <textarea name="bio" defaultValue={author.bio ?? ""} rows={4} className="rounded-md border border-border-strong p-2" />
        </label>

        <div>
          <p className="mb-1 text-xs font-medium text-ink-muted">
            Eligible categories (none checked = eligible for every category)
          </p>
          <div className="flex flex-wrap gap-3">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5">
                <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={eligibleCategoryIds.has(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="self-start rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark">
          Save
        </button>
      </form>
    </div>
  );
}
