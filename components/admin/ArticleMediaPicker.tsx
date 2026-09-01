"use client";

import { useState } from "react";
import Image from "next/image";
import { isPublishableReuseStatus } from "@/lib/publication-checks";
import type { ArticleMediaOption } from "@/lib/article-media";

interface ArticleMediaPickerProps {
  media: ArticleMediaOption[];
  onSelect: (media: ArticleMediaOption) => void;
}

/** A popup limited to the images already acquired for THIS article's own
 * SourceItem (lib/article-media.ts) — not the full media library. Renders
 * nothing when there's nothing to show, matching this codebase's "don't
 * show a fake capability" convention (see MediaUploadButton's own
 * not-available state). */
export function ArticleMediaPicker({ media, onSelect }: ArticleMediaPickerProps) {
  const [open, setOpen] = useState(false);
  if (media.length === 0) return null;

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
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
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelect(m);
                      setOpen(false);
                    }}
                    className="flex flex-col overflow-hidden rounded-lg border border-border text-left hover:border-accent"
                  >
                    <div className="relative aspect-video bg-paper">
                      <Image src={m.url} alt={m.altText} fill className="object-cover" unoptimized />
                    </div>
                    <div className="p-2 text-xs">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 font-semibold ${
                          publishable ? "bg-pakistan-soft text-pakistan" : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {m.reuseStatus.replace(/_/g, " ")}
                      </span>
                      {m.sourceDomain && <p className="mt-1 truncate text-ink-muted">From {m.sourceDomain}</p>}
                      {!publishable && <p className="mt-1 text-amber-800">Selecting this still requires review before it can publish.</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
