"use client";

import { useRef, useState } from "react";

interface MediaUploadButtonProps {
  kind: "article" | "author";
  /** Computed server-side via lib/media/storage.ts's isMediaUploadAvailable()
   * and passed down — never re-derived client-side, since the guard depends
   * on server-only env vars (VERCEL, STORAGE_PROVIDER). */
  available: boolean;
  /** When known (e.g. editing an existing article), tags the uploaded Media
   * row with this article via Media.articleId — so it shows up in that
   * article's own "choose from article images" picker even before the
   * article is saved with it as the featured image. Omitted when there's no
   * article yet (create mode) or the upload isn't tied to one at all (the
   * Media Library's own uploader passes its own explicit choice instead). */
  articleId?: string;
  onUploaded: (result: { id: string; url: string }) => void;
}

export function MediaUploadButton({ kind, available, articleId, onUploaded }: MediaUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) {
    return (
      <p className="rounded-md border border-dashed border-border-strong bg-paper p-2 text-xs text-ink-muted">
        Media uploads require durable object storage in production — not configured. Use an image URL instead.
      </p>
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", kind);
      if (articleId) formData.append("articleId", articleId);
      const res = await fetch("/api/media/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
      } else {
        onUploaded({ id: data.id, url: data.url });
      }
    } catch {
      setError("Upload failed — check your connection.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-accent hover:text-accent">
        {uploading ? "Uploading…" : "Upload image"}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
      </label>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
