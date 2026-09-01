import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_MEDIA } from "@/lib/permissions";
import { isMediaUploadAvailable } from "@/lib/media/storage";
import { deleteMediaAction, approveMediaAction, rejectMediaAction } from "@/lib/media-actions";
import { MediaLibraryUploader } from "@/components/admin/MediaLibraryUploader";
import type { ImageReuseStatus, Prisma } from "@prisma/client";

/** Resolves "which article is this for", in priority order: explicitly
 * tagged at upload time (Media.articleId) > currently in use as an
 * article's featured image > the discovery item it was acquired for having
 * since become a draft. All three are real, just answering slightly
 * different questions — this picks whichever is most direct. */
function resolveMediaArticle(
  media: { id: string; articleId: string | null; sourceItem: { convertedArticleId: string | null } | null },
  featuredBy: Map<string, { id: string; title: string }>,
  titleById: Map<string, string>,
): { id: string; title: string } | null {
  if (media.articleId) {
    const title = titleById.get(media.articleId);
    if (title) return { id: media.articleId, title };
  }
  const featured = featuredBy.get(media.id);
  if (featured) return featured;
  const convertedId = media.sourceItem?.convertedArticleId;
  if (convertedId) {
    const title = titleById.get(convertedId);
    if (title) return { id: convertedId, title };
  }
  return null;
}

export const dynamic = "force-dynamic";

const PENDING_STATUSES: ImageReuseStatus[] = ["UNKNOWN", "REQUIRES_REVIEW"];
const PUBLISHABLE_STATUSES: ImageReuseStatus[] = ["ALLOWED", "LICENSED", "OWNED", "GENERATED"];

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Requires review" },
  { key: "ready", label: "Ready to use" },
  { key: "rejected", label: "Rejected" },
] as const;

const STATUS_BADGE_CLASSES: Record<ImageReuseStatus, string> = {
  ALLOWED: "bg-pakistan-soft text-pakistan",
  LICENSED: "bg-pakistan-soft text-pakistan",
  OWNED: "bg-pakistan-soft text-pakistan",
  GENERATED: "bg-pakistan-soft text-pakistan",
  UNKNOWN: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  REQUIRES_REVIEW: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  REJECTED: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

interface SearchParams {
  tab?: string;
}

export default async function MediaLibraryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!CAN_MANAGE_MEDIA.includes(user.role)) redirect("/admin");

  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "all";

  const where: Prisma.MediaWhereInput =
    tab === "pending"
      ? { reuseStatus: { in: PENDING_STATUSES } }
      : tab === "ready"
        ? { reuseStatus: { in: PUBLISHABLE_STATUSES } }
        : tab === "rejected"
          ? { reuseStatus: "REJECTED" }
          : {};

  const media = await prisma.media.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { sourceItem: { select: { convertedArticleId: true } } },
  });
  const available = isMediaUploadAvailable();

  const mediaIds = media.map((m) => m.id);
  const candidateArticleIds = new Set<string>();
  for (const m of media) {
    if (m.articleId) candidateArticleIds.add(m.articleId);
    if (m.sourceItem?.convertedArticleId) candidateArticleIds.add(m.sourceItem.convertedArticleId);
  }

  const [featuredByRows, titleRows, recentArticles] = await Promise.all([
    mediaIds.length
      ? prisma.article.findMany({ where: { featuredMediaId: { in: mediaIds } }, select: { id: true, title: true, featuredMediaId: true } })
      : Promise.resolve([]),
    candidateArticleIds.size
      ? prisma.article.findMany({ where: { id: { in: [...candidateArticleIds] } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    // For the upload-tagging dropdown — most recently updated, capped so the
    // select stays usable; not the definitive article list (that's /admin/articles).
    prisma.article.findMany({ orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, title: true } }),
  ]);
  const featuredBy = new Map(featuredByRows.filter((a) => a.featuredMediaId).map((a) => [a.featuredMediaId!, { id: a.id, title: a.title }]));
  const titleById = new Map(titleRows.map((a) => [a.id, a.title]));

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Media</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Uploaded and automatically-found images. Public accessibility is never treated as permission to
        publish — anything found automatically stays in &quot;Requires review&quot; until a person clears it.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-paper-raised p-5">
        <p className="mb-2 text-sm font-bold">Upload</p>
        <MediaLibraryUploader available={available} articles={recentArticles} />
      </div>

      <div className="mt-6 flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/admin/media" : `/admin/media?tab=${t.key}`}
            className={`rounded-t-md px-3 py-2 text-sm font-semibold ${
              tab === t.key ? "border-b-2 border-accent text-accent" : "text-ink-muted hover:text-ink-soft"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {media.map((m) => {
          const pending = PENDING_STATUSES.includes(m.reuseStatus);
          const forArticle = resolveMediaArticle(m, featuredBy, titleById);
          return (
            <div key={m.id} className="overflow-hidden rounded-xl border border-border bg-paper-raised">
              <div className="relative aspect-video bg-paper">
                <Image src={m.url} alt={m.altText} fill className="object-cover" unoptimized />
              </div>
              <div className="p-3 text-xs">
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[m.reuseStatus]}`}>
                  {m.reuseStatus.replace(/_/g, " ")}
                </span>
                <p className="mt-1 truncate font-medium" title={m.filename}>
                  {m.filename}
                </p>
                <p className="mt-0.5 text-ink-muted">
                  {(m.sizeBytes / 1024).toFixed(0)} KB · {m.createdAt.toLocaleDateString()}
                </p>
                {m.sourceDomain && <p className="mt-0.5 text-ink-muted">Found on {m.sourceDomain}</p>}
                {forArticle ? (
                  <p className="mt-0.5 truncate">
                    Article:{" "}
                    <Link href={`/admin/articles/${forArticle.id}`} className="font-medium text-accent hover:underline" title={forArticle.title}>
                      {forArticle.title}
                    </Link>
                  </p>
                ) : (
                  <p className="mt-0.5 text-ink-muted">Not linked to an article yet</p>
                )}
                <p className="mt-1 break-all text-ink-muted">{m.url}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {pending && (
                    <>
                      <form action={approveMediaAction.bind(null, m.id)}>
                        <button type="submit" className="text-xs font-semibold text-pakistan hover:underline">
                          Approve
                        </button>
                      </form>
                      <form action={rejectMediaAction.bind(null, m.id)}>
                        <button type="submit" className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400">
                          Reject
                        </button>
                      </form>
                    </>
                  )}
                  <form action={deleteMediaAction.bind(null, m.id)}>
                    <button type="submit" className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
        {media.length === 0 && <p className="col-span-full text-sm text-ink-muted">No files in this view.</p>}
      </div>
    </div>
  );
}
