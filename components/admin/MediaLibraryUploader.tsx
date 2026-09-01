"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MediaUploadButton } from "./MediaUploadButton";

interface MediaLibraryUploaderProps {
  available: boolean;
  /** Recently updated articles, for the optional "tag this upload for an
   * article" dropdown — see Media.articleId. Not the full article list. */
  articles: { id: string; title: string }[];
}

export function MediaLibraryUploader({ available, articles }: MediaLibraryUploaderProps) {
  const router = useRouter();
  const [articleId, setArticleId] = useState("");

  return (
    <div className="flex flex-col gap-2">
      {articles.length > 0 && (
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Tag for an article (optional — makes it show up in that article&apos;s own image picker)
          <select
            value={articleId}
            onChange={(e) => setArticleId(e.target.value)}
            className="w-full max-w-sm rounded-md border border-border-strong p-2 text-sm text-ink"
          >
            <option value="">Not tagged to a specific article</option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <MediaUploadButton
        kind="article"
        available={available}
        articleId={articleId || undefined}
        onUploaded={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
