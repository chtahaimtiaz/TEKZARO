import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_VIDEOS } from "@/lib/permissions";
import { createVideoAction } from "@/lib/video-actions";

export const dynamic = "force-dynamic";

export default async function NewVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_VIDEOS.includes(user.role)) redirect("/admin");
  const { error } = await searchParams;

  const [categories, authors] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.author.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Multimedia</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">New Video</h1>
      <p className="mt-1 text-sm text-ink-muted">Publish a new video story or YouTube embed.</p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form action={createVideoAction} className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-paper-raised p-5 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink">Title</span>
          <input name="title" required placeholder="e.g. Inside Pakistan's IT Sector Revolution" className="rounded-md border border-border-strong p-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink">Video URL (YouTube or Direct Video)</span>
          <input
            name="videoUrl"
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
            className="rounded-md border border-border-strong p-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink">Thumbnail URL (Optional)</span>
          <input
            name="thumbnailUrl"
            type="url"
            placeholder="https://... (or leave empty to let YouTube extract automatically)"
            className="rounded-md border border-border-strong p-2"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Category</span>
            <select name="categoryId" required className="rounded-md border border-border-strong p-2">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Author / Presenter</span>
            <select name="authorId" required className="rounded-md border border-border-strong p-2">
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
            <input name="duration" placeholder="05:30" className="rounded-md border border-border-strong p-2" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Status</span>
            <select name="status" className="rounded-md border border-border-strong p-2">
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink">Description / Context</span>
          <textarea name="description" rows={4} placeholder="Summary of what is discussed in the video..." className="rounded-md border border-border-strong p-2" />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="featured" value="true" />
          <span className="font-medium text-ink">Feature this video on homepage / video hub</span>
        </label>

        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            name="publishNow"
            value="true"
            className="cursor-pointer rounded-md bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
          >
            Publish Video Now
          </button>
          <button
            type="submit"
            name="status"
            value="DRAFT"
            className="cursor-pointer rounded-md border border-border-strong bg-paper px-4 py-2 font-semibold text-ink hover:bg-paper-raised"
          >
            Save as Draft
          </button>
        </div>
      </form>
    </div>
  );
}
