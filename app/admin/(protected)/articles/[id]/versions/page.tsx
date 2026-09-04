import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canEditArticle, canViewArticle } from "@/lib/permissions";
import { restoreVersionAction } from "@/lib/article-actions";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ArticleVersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) notFound();
  if (!canViewArticle(user.role, article, user.id)) {
    return <p className="text-sm text-ink-muted">You don&apos;t have permission to view this article&apos;s history.</p>;
  }
  const canRestore = canEditArticle(user.role, article, user.id);

  const versions = await prisma.articleVersion.findMany({
    where: { articleId: id },
    orderBy: { versionNumber: "desc" },
    include: { editor: { select: { name: true } } },
  });

  return (
    <div>
      <Link href={`/admin/articles/${id}`} className="text-sm font-semibold text-accent hover:underline">
        ← Back to editor
      </Link>
      <h1 className="mt-2 font-serif text-3xl font-bold">Version history</h1>
      <p className="mt-1 text-sm text-ink-muted">{article.title}</p>

      <div className="mt-6 flex flex-col divide-y divide-border rounded-xl border border-border bg-paper-raised">
        {versions.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">
                v{v.versionNumber} — <span className="font-normal text-ink-muted">{v.status.replace(/_/g, " ")}</span>
              </p>
              <p className="text-sm text-ink-muted">
                {v.editor.name} · {formatDateTime(v.createdAt)}
                {v.changeSummary && <> · {v.changeSummary}</>}
              </p>
            </div>
            {canRestore && v.versionNumber !== versions[0].versionNumber && (
              <form action={restoreVersionAction.bind(null, id, v.id)}>
                <button type="submit" className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold hover:border-accent">
                  Restore this version
                </button>
              </form>
            )}
          </div>
        ))}
        {versions.length === 0 && <p className="p-4 text-sm text-ink-muted">No versions recorded yet.</p>}
      </div>
    </div>
  );
}
