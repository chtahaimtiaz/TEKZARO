import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_AUTHORS } from "@/lib/permissions";
import { createAuthorAction, setAuthorActiveAction } from "@/lib/author-actions";

export const dynamic = "force-dynamic";

export default async function AuthorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_AUTHORS.includes(user.role)) redirect("/admin");
  const { error } = await searchParams;

  const [authors, categories] = await Promise.all([
    prisma.author.findMany({
      orderBy: { name: "asc" },
      include: { categories: { select: { id: true, name: true } }, _count: { select: { articles: true } } },
    }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Authors</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Author bylines and which categories each is eligible to write for. An author with no categories
        checked is eligible for every category.
      </p>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

      <form action={createAuthorAction} className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-paper-raised p-4 text-sm">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            Name
            <input name="name" required className="rounded-md border border-border-strong p-2" />
          </label>
          <button type="submit" className="rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark">
            Add author
          </button>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-muted">Eligible categories (none = all)</p>
          <div className="flex flex-wrap gap-3">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5">
                <input type="checkbox" name="categoryIds" value={c.id} />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Name</th>
              <th className="p-3">Position</th>
              <th className="p-3">Eligible categories</th>
              <th className="p-3">Articles</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {authors.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-b-0">
                <td className="p-3 font-medium">
                  <Link href={`/admin/authors/${a.id}`} className="hover:underline">
                    {a.name}
                  </Link>
                </td>
                <td className="p-3 text-ink-soft">{a.position || "—"}</td>
                <td className="p-3 text-ink-soft">
                  {a.categories.length === 0 ? "All categories" : a.categories.map((c) => c.name).join(", ")}
                </td>
                <td className="p-3">{a._count.articles}</td>
                <td className="p-3">{a.active ? "Active" : "Disabled"}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/admin/authors/${a.id}`} className="text-xs font-semibold text-accent hover:underline">
                      Edit
                    </Link>
                    <form action={setAuthorActiveAction.bind(null, a.id, !a.active)}>
                      <button type="submit" className="text-xs font-semibold text-accent hover:underline">
                        {a.active ? "Disable" : "Enable"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {authors.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">
                  No authors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
