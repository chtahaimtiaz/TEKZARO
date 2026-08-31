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
  UNKNOWN: "bg-amber-50 text-amber-800",
  REQUIRES_REVIEW: "bg-amber-50 text-amber-800",
  REJECTED: "bg-red-50 text-red-700",
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

  const media = await prisma.media.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  const available = isMediaUploadAvailable();

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
        <MediaLibraryUploader available={available} />
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
                        <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
                          Reject
                        </button>
                      </form>
                    </>
                  )}
                  <form action={deleteMediaAction.bind(null, m.id)}>
                    <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
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
