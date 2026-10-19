import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_VIDEOS } from "@/lib/permissions";
import { deleteVideoAction, toggleVideoPublishAction } from "@/lib/video-actions";
import { getAutoThumbnailUrl } from "@/lib/videos";

export const dynamic = "force-dynamic";

export default async function AdminVideosPage() {
  const user = await requireUser();
  if (!CAN_MANAGE_VIDEOS.includes(user.role)) redirect("/admin");

  const videos = await prisma.video.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true, author: true },
  });

  return (
    <div className="max-w-5xl">
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

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-paper-raised">
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
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                      v.status === "PUBLISHED"
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {v.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-ink-muted">
                  {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : "Not published"}
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-3">
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
                    <Link
                      href={`/admin/videos/${v.id}`}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      Edit
                    </Link>
                    <form action={deleteVideoAction.bind(null, v.id)}>
                      <button
                        type="submit"
                        className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
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
                  No videos created yet. Click &quot;Add new video&quot; to publish your first video story.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
