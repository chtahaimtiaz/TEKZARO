"use client";

import { useRef, useState } from "react";

interface AdCreativeUploadButtonProps {
  available: boolean;
  onUploaded: (url: string) => void;
}

export function AdCreativeUploadButton({ available, onUploaded }: AdCreativeUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) {
    return (
      <p className="rounded-md border border-dashed border-border-strong bg-paper p-2 text-xs text-ink-muted">
        Creative uploads require durable object storage in production — not configured.
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
      const res = await fetch("/api/admin/ad-creative-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
      } else {
        onUploaded(data.url);
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
        {uploading ? "Uploading…" : "Upload creative image"}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
      </label>
      {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
