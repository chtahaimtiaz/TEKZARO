"use client";

import { useRef, useState } from "react";
import Image from "next/image";

interface Props {
  currentPhotoUrl: string | null;
}

/**
 * AuthorPhotoUploader — replaces the plain "Photo URL" text input.
 *
 * Flow:
 *  1. User picks a file → previewed immediately with a local object URL.
 *  2. Upload fires against /api/media/upload (kind=author).
 *  3. On success the returned CDN URL is written into the hidden
 *     <input name="photoUrl"> that the existing server action reads.
 *
 * Falls back gracefully: if no file is picked the hidden input keeps the
 * author's current photoUrl so Save still works without touching the photo.
 */
export function AuthorPhotoUploader({ currentPhotoUrl }: Props) {
  const [preview, setPreview] = useState<string | null>(currentPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string>(currentPhotoUrl ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Immediate local preview — no round-trip needed.
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setError(null);
    setUploading(true);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "author");
      body.append("altText", "Author photo");

      const res = await fetch("/api/media/upload", { method: "POST", body });
      const json = await res.json() as { url?: string; error?: string };

      if (!res.ok || !json.url) {
        setError(json.error ?? "Upload failed. Try again.");
        // Revert preview to the last saved URL.
        setPreview(savedUrl || null);
        return;
      }

      setSavedUrl(json.url);
      setPreview(json.url);
    } catch {
      setError("Network error. Try again.");
      setPreview(savedUrl || null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Author Photo</span>

      {/* Avatar preview */}
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-paper-raised">
          {preview ? (
            <Image
              src={preview}
              alt="Author photo preview"
              fill
              className="object-cover"
              unoptimized={preview.startsWith("blob:")}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-ink-muted">
              No photo
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-raised disabled:opacity-50"
          >
            {uploading ? "Uploading…" : preview ? "Change photo" : "Upload photo"}
          </button>
          {preview && !uploading && (
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setSavedUrl("");
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="text-xs text-red-500 hover:underline"
            >
              Remove photo
            </button>
          )}
          <p className="text-xs text-ink-muted">JPG, PNG or WebP · max 4 MB</p>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Hidden file input — not visible, triggered by the button above */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      {/*
        The name="photoUrl" hidden input is what the existing updateAuthorAction
        server action reads. Writing the CDN URL here keeps the server action
        unchanged.
      */}
      <input type="hidden" name="photoUrl" value={savedUrl} />

      {/* Manual URL fallback — collapsible so power users can still paste a URL */}
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink">
          Or enter a URL manually
        </summary>
        <input
          type="url"
          placeholder="https://…"
          value={savedUrl}
          onChange={(e) => {
            setSavedUrl(e.target.value);
            setPreview(e.target.value || null);
          }}
          className="mt-1 w-full rounded-md border border-border-strong p-2 text-sm"
        />
      </details>
    </div>
  );
}
