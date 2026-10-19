import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_VIDEOS } from "@/lib/permissions";
import { updateVideoAction } from "@/lib/video-actions";

export const dynamic = "force-dynamic";

export default async function EditVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_VIDEOS.includes(user.role)) redirect("/admin");
  const { id } = await params;
  const { error } = await searchParams;

  const [video, categories, authors] = await Promise.all([
    prisma.video.findUnique({ where: { id } }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.author.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  if (!video) notFound();

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Multimedia</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">{video.title}</h1>
      <p className="mt-1 text-sm text-ink-muted">/video/{video.slug}</p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form action={updateVideoAction.bind(null, video.id)} className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-paper-raised p-5 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink">Title</span>
          <input name="title" defaultValue={video.title} required className="rounded-md border border-border-strong p-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink">Video URL</span>
          <input name="videoUrl" type="url" defaultValue={video.videoUrl} required className="rounded-md border border-border-strong p-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink">Thumbnail URL</span>
          <input name="thumbnailUrl" type="url" defaultValue={video.thumbnailUrl ?? ""} className="rounded-md border border-border-strong p-2" />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Category</span>
            <select name="categoryId" defaultValue={video.categoryId} required className="rounded-md border border-border-strong p-2">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Author / Presenter</span>
            <select name="authorId" defaultValue={video.authorId} required className="rounded-md border border-border-strong p-2">
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Duration (e.g. 10:45)</span>
            <input name="duration" defaultValue={video.duration ?? ""} className="rounded-md border border-border-strong p-2" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Status</span>
            <select name="status" defaultValue={video.status} className="rounded-md border border-border-strong p-2">
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink">Description</span>
          <textarea name="description" defaultValue={video.description ?? ""} rows={4} className="rounded-md border border-border-strong p-2" />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="featured" value="true" defaultChecked={video.featured} />
          <span className="font-medium text-ink">Feature this video</span>
        </label>

        <div className="mt-2 flex gap-3">
          <button type="submit" className="rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
