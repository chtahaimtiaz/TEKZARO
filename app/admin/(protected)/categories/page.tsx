import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_SOURCES } from "@/lib/permissions";
import { createCategoryAction, deleteCategoryAction } from "@/lib/category-actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_SOURCES.includes(user.role)) redirect("/admin");
  const { error } = await searchParams;

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { articles: true, sources: true } } },
  });

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Categories</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Article and source categories shown across the public site and used to file discovery items.
      </p>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

      <form action={createCategoryAction} className="mt-6 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-paper-raised p-4">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" required className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Description (optional)
          <input name="description" className="rounded-md border border-border-strong p-2" />
        </label>
        <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark">
          Add
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Name</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Description</th>
              <th className="p-3">Articles</th>
              <th className="p-3">Sources</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-b-0">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-ink-muted">{c.slug}</td>
                <td className="p-3 text-ink-soft">{c.description || "—"}</td>
                <td className="p-3">{c._count.articles}</td>
                <td className="p-3">{c._count.sources}</td>
                <td className="p-3 text-right">
                  <form action={deleteCategoryAction.bind(null, c.id)}>
                    <button type="submit" className="text-xs font-semibold text-ink-muted hover:text-red-600">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
