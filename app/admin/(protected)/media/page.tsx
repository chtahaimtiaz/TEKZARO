import { redirect } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_MEDIA } from "@/lib/permissions";
import { isMediaUploadAvailable } from "@/lib/media/storage";
import { deleteMediaAction } from "@/lib/media-actions";
import { MediaLibraryUploader } from "@/components/admin/MediaLibraryUploader";

export const dynamic = "force-dynamic";

export default async function MediaLibraryPage() {
  const user = await requireUser();
  if (!CAN_MANAGE_MEDIA.includes(user.role)) redirect("/admin");

  const media = await prisma.media.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const available = isMediaUploadAvailable();

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Media</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Uploaded images for use as featured images and elsewhere. {media.length} file(s).
      </p>

      <div className="mt-6 rounded-xl border border-border bg-paper-raised p-5">
        <p className="mb-2 text-sm font-bold">Upload</p>
        <MediaLibraryUploader available={available} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {media.map((m) => (
          <div key={m.id} className="overflow-hidden rounded-xl border border-border bg-paper-raised">
            <div className="relative aspect-video bg-paper">
              <Image src={m.url} alt={m.altText} fill className="object-cover" unoptimized />
            </div>
            <div className="p-3 text-xs">
              <p className="truncate font-medium" title={m.filename}>
                {m.filename}
              </p>
              <p className="mt-0.5 text-ink-muted">
                {(m.sizeBytes / 1024).toFixed(0)} KB · {m.createdAt.toLocaleDateString()}
              </p>
              <p className="mt-1 break-all text-ink-muted">{m.url}</p>
              <form action={deleteMediaAction.bind(null, m.id)} className="mt-2">
                <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
        {media.length === 0 && <p className="col-span-full text-sm text-ink-muted">No uploads yet.</p>}
      </div>
    </div>
  );
}
