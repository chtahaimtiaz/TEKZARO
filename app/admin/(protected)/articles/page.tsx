import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_DELETE_ARTICLE } from "@/lib/permissions";
import { DeleteAllArticlesButton } from "@/components/admin/DeleteAllArticlesButton";
import type { ArticleStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const ALL_STATUSES: ArticleStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
];

interface SearchParams {
  q?: string;
  category?: string;
  status?: string;
  author?: string;
  demo?: string;
  sort?: string;
  page?: string;
}

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [categories, authors] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.author.findMany({ orderBy: { name: "asc" } }),
  ]);

  const where: Prisma.ArticleWhereInput = {};
  if (sp.q) {
    where.title = { contains: sp.q, mode: "insensitive" };
  }
  if (sp.category) where.categoryId = sp.category;
  if (sp.status && ALL_STATUSES.includes(sp.status as ArticleStatus)) {
    where.status = sp.status as ArticleStatus;
  }
  if (sp.author) where.authorId = sp.author;
  if (sp.demo === "true") where.isDemo = true;
  if (sp.demo === "false") where.isDemo = false;
  if (user.role === "REPORTER" || user.role === "RESEARCHER") where.createdById = user.id;

  const orderBy: Prisma.ArticleOrderByWithRelationInput =
    sp.sort === "oldest" ? { createdAt: "asc" } : { createdAt: "desc" };

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { category: true, author: true, createdBy: { select: { name: true } } },
    }),
    prisma.article.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canDeleteAll = CAN_DELETE_ARTICLE.includes(user.role);
  const totalArticleCount = canDeleteAll ? await prisma.article.count() : 0;
  const qs = (overrides: Partial<SearchParams>) => {
    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...sp, ...overrides })) {
      if (v) merged[k] = v;
    }
    return `?${new URLSearchParams(merged).toString()}`;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Newsroom</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">Articles</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDeleteAll && <DeleteAllArticlesButton articleCount={totalArticleCount} />}
          <Link href="/admin/articles/new" className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark">
            + New article
          </Link>
        </div>
      </div>

      <form className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-paper-raised p-4 sm:grid-cols-3 lg:grid-cols-5">
        <input name="q" defaultValue={sp.q} placeholder="Search titles…" className="col-span-2 rounded-md border border-border-strong p-2 text-sm sm:col-span-3 lg:col-span-2" />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="">All statuses</option>
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
        <select name="author" defaultValue={sp.author ?? ""} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="">All authors</option>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="demo" defaultValue={sp.demo ?? ""} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="">Demo + real</option>
          <option value="true">Demo only</option>
          <option value="false">Real only</option>
        </select>
        <select name="sort" defaultValue={sp.sort ?? "newest"} className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft dark:text-paper">
          Apply
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Title</th>
              <th className="p-3">Category</th>
              <th className="p-3">Status</th>
              <th className="p-3">Author</th>
              <th className="p-3">Created by</th>
              <th className="p-3">Demo</th>
              <th className="p-3">Verification</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-b-0 hover:bg-paper">
                <td className="max-w-xs truncate p-3 font-medium">{a.title}</td>
                <td className="p-3 text-ink-soft">{a.category.name}</td>
                <td className="p-3">
                  <span className="rounded bg-paper px-2 py-0.5 text-xs font-semibold">{a.status.replace(/_/g, " ")}</span>
                </td>
                <td className="p-3 text-ink-soft">{a.author.name}</td>
                <td className="p-3 text-ink-soft">{a.createdBy?.name ?? "—"}</td>
                <td className="p-3">{a.isDemo ? "Yes" : ""}</td>
                <td className="p-3">
                  {a.autoPublished && (
                    <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">Auto-published</span>
                  )}
                  {!a.autoPublished && a.verificationStatus !== "UNVERIFIED" && (
                    <span className="text-xs text-ink-muted">{a.verificationStatus.replace(/_/g, " ").toLowerCase()}</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <Link href={`/admin/articles/${a.id}`} className="font-semibold text-accent hover:underline">
                    Edit →
                  </Link>
                </td>
              </tr>
            ))}
            {articles.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-ink-muted">
                  No articles match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={qs({ page: String(page - 1) })} className="rounded-md border border-border px-3 py-1.5 hover:border-accent">
              ← Previous
            </Link>
          )}
          <span className="text-ink-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={qs({ page: String(page + 1) })} className="rounded-md border border-border px-3 py-1.5 hover:border-accent">
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
