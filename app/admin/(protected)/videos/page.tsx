import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_VIDEOS } from "@/lib/permissions";
import { deleteVideoAction, toggleVideoPublishAction, archiveVideoAction } from "@/lib/video-actions";
import { getAutoThumbnailUrl } from "@/lib/videos";
import type { VideoStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

const STATUS_TABS: { label: string; value: VideoStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Archived", value: "ARCHIVED" },
];

interface SearchParams {
  status?: string;
  q?: string;
  page?: string;
}

export default async function AdminVideosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_VIDEOS.includes(user.role)) redirect("/admin");

  const { status: statusParam = "ALL", q = "", page: pageParam = "1" } = await searchParams;
  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const activeStatus = STATUS_TABS.find((t) => t.value === statusParam)?.value ?? "ALL";

  const where = {
    ...(activeStatus !== "ALL" ? { status: activeStatus as VideoStatus } : {}),
    ...(q.trim()
      ? { title: { contains: q.trim(), mode: "insensitive" as const } }
      : {}),
  };

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { category: true, author: true },
    }),
    prisma.video.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildHref(params: Partial<SearchParams>) {
    const p = new URLSearchParams();
    if (params.status && params.status !== "ALL") p.set("status", params.status);
    if (params.q ?? q) p.set("q", params.q ?? q);
    if (params.page && params.page !== "1") p.set("page", params.page);
    const qs = p.toString();
    return `/admin/videos${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Multimedia</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">Videos</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Manage video stories, interviews, and YouTube features published to /videos.
          </p>
        </div>
        <Link
          href="/admin/videos/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          Add new video
        </Link>
      </div>

      {/* Search + Status Filter */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form method="GET" className="flex flex-1 items-center gap-2">
          {activeStatus !== "ALL" && (
            <input type="hidden" name="status" value={activeStatus} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search videos by title…"
            className="min-w-0 flex-1 rounded-md border border-border-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-ink-soft hover:bg-paper-raised"
          >
            Search
          </button>
          {q && (
            <Link href={buildHref({ q: "" })} className="text-xs text-accent hover:underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Status Tabs */}
      <div className="mt-4 flex gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => {
          const isActive = activeStatus === tab.value;
          return (
            <Link
              key={tab.value}
              href={buildHref({ status: tab.value, page: "1", q })}
              className={`-mb-px rounded-t px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border border-b-paper border-border bg-paper text-accent"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        <span className="ml-auto self-center pr-1 text-xs text-ink-muted">
          {total} video{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="mt-0 overflow-x-auto rounded-b-xl rounded-r-xl border border-t-0 border-border bg-paper-raised">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Video</th>
              <th className="p-3">Category</th>
              <th className="p-3">Author</th>
              <th className="p-3">Status</th>
              <th className="p-3">Date</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => {
              const thumb = getAutoThumbnailUrl(v.videoUrl, v.thumbnailUrl);
              const statusColor =
                v.status === "PUBLISHED"
                  ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                  : v.status === "ARCHIVED"
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

              return (
                <tr key={v.id} className="border-b border-border last:border-b-0 hover:bg-paper/50">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-10 w-16 shrink-0 rounded border border-border object-cover" />
                      ) : (
                        <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded border border-border bg-paper-sunk text-[10px] text-ink-muted">
                          Video
                        </div>
                      )}
                      <div>
                        <Link href={`/admin/videos/${v.id}`} className="block font-medium text-ink hover:underline">
                          {v.title}
                        </Link>
                        {v.status === "PUBLISHED" && (
                          <Link href={`/video/${v.slug}`} target="_blank" className="text-[11px] text-accent hover:underline">
                            View live ↗
                          </Link>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-ink-soft">{v.category.name}</td>
                  <td className="p-3 text-ink-soft">{v.author.name}</td>
                  <td className="p-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${statusColor}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-ink-muted">
                    {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : "Not published"}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Publish / Unpublish */}
                      {v.status !== "ARCHIVED" && (
                        <form action={toggleVideoPublishAction.bind(null, v.id)}>
                          <input type="hidden" name="returnTo" value="/admin/videos" />
                          <button
                            type="submit"
                            className={`cursor-pointer rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                              v.status === "PUBLISHED"
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-green-600 text-white hover:bg-green-700"
                            }`}
                          >
                            {v.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                          </button>
                        </form>
                      )}

                      {/* Edit */}
                      <Link
                        href={`/admin/videos/${v.id}`}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        Edit
                      </Link>

                      {/* Archive (only if not already archived) */}
                      {v.status !== "ARCHIVED" && (
                        <form action={archiveVideoAction.bind(null, v.id)}>
                          <button
                            type="submit"
                            className="text-xs font-semibold text-ink-muted hover:text-orange-600 hover:underline"
                          >
                            Archive
                          </button>
                        </form>
                      )}

                      {/* Delete */}
                      <form
                        action={deleteVideoAction.bind(null, v.id)}
                        onSubmit={undefined}
                      >
                        <button
                          type="submit"
                          className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                          formAction={deleteVideoAction.bind(null, v.id) as unknown as string}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {videos.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-ink-muted">
                  {q
                    ? `No videos match "${q}".`
                    : activeStatus !== "ALL"
                    ? `No ${activeStatus.toLowerCase()} videos.`
                    : `No videos created yet. Click "Add new video" to publish your first video story.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={buildHref({ page: String(page - 1) })}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-paper-raised"
            >
              ← Prev
            </Link>
          )}
          <span className="text-sm text-ink-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildHref({ page: String(page + 1) })}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-paper-raised"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
