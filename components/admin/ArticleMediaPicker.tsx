"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { isPublishableReuseStatus, isPendingReuseStatus } from "@/lib/publication-checks";
import { approveMediaAction, rejectMediaAction } from "@/lib/media-actions";
import type { ArticleMediaOption } from "@/lib/article-media";

interface ArticleMediaPickerProps {
  media: ArticleMediaOption[];
  onSelect: (media: ArticleMediaOption) => void;
  /** CAN_MANAGE_MEDIA (ADMIN/EDITOR) — gates the Approve/Reject actions,
   * mirroring the same review actions already on the Media Library page.
   * A REPORTER can still open this popup and select an image; they just
   * can't clear one for use from here. */
  canManageMedia: boolean;
}

/** A popup limited to the images available for THIS article (see
 * lib/article-media.ts) — not the full media library. Renders nothing when
 * there's nothing to show, matching this codebase's "don't show a fake
 * capability" convention (see MediaUploadButton's own not-available state). */
export function ArticleMediaPicker({ media, onSelect, canManageMedia }: ArticleMediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const router = useRouter();
  if (media.length === 0) return null;

  async function handleApprove(id: string) {
    setPendingId(id);
    try {
      await approveMediaAction(id);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function handleReject(id: string) {
    setPendingId(id);
    try {
      await rejectMediaAction(id);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-2 rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-accent hover:text-accent"
      >
        Choose from article images ({media.length})
      </button>

      {open && (
        <div
          // bg-black, not the ink token: a modal backdrop dims whatever's
          // behind it the same way in both themes, rather than flipping to
          // a light haze in dark mode.
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-paper-raised p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">Images found for this article</p>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-muted hover:text-ink">
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {media.map((m) => {
                const publishable = isPublishableReuseStatus(m.reuseStatus);
                const pending = isPendingReuseStatus(m.reuseStatus);
                const busy = pendingId === m.id;
                return (
                  <div key={m.id} className="flex flex-col overflow-hidden rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(m);
                        setOpen(false);
                      }}
                      className="text-left hover:border-accent"
                    >
                      <div className="relative aspect-video bg-paper">
                        <Image src={m.url} alt={m.altText} fill className="object-cover" unoptimized />
                      </div>
                    </button>
                    <div className="p-2 text-xs">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 font-semibold ${
                          publishable ? "bg-pakistan-soft text-pakistan" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {m.reuseStatus.replace(/_/g, " ")}
                      </span>
                      {m.sourceDomain && <p className="mt-1 truncate text-ink-muted">From {m.sourceDomain}</p>}
                      {!publishable && <p className="mt-1 text-amber-800 dark:text-amber-300">Selecting this still requires review before it can publish.</p>}
                      {canManageMedia && pending && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleApprove(m.id)}
                            className="text-xs font-semibold text-pakistan hover:underline disabled:opacity-50"
                          >
                            {busy ? "…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleReject(m.id)}
                            className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                          >
                            {busy ? "…" : "Reject"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
