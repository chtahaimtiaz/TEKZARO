"use client";

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { MediaUploadButton } from "./MediaUploadButton";
import { ArticleMediaPicker } from "./ArticleMediaPicker";
import type { ArticleMediaOption } from "@/lib/article-media";

export interface ArticleImageNodeOptions {
  articleId?: string;
  mediaUploadAvailable: boolean;
  articleMediaOptions: ArticleMediaOption[];
  canManageMedia: boolean;
}

/**
 * Reuses the existing, unmodified MediaUploadButton/ArticleMediaPicker —
 * previously wired only to the article's single featured image — so
 * in-body images gain real upload/picker support for the first time.
 * BlockEditor's image block has only ever had a raw URL text field.
 */
export function EditorImageNodeView({ node, updateAttributes, deleteNode, extension }: NodeViewProps) {
  const options = extension.options as ArticleImageNodeOptions;
  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const caption = typeof node.attrs.caption === "string" ? node.attrs.caption : "";
  const credit = typeof node.attrs.credit === "string" ? node.attrs.credit : "";
  const [urlDraft, setUrlDraft] = useState(src);

  if (!src) {
    return (
      <NodeViewWrapper className="my-4 rounded-lg border border-dashed border-border-strong p-4" contentEditable={false}>
        <p className="mb-2 text-sm font-semibold text-ink-soft">Insert an image</p>
        <div className="flex flex-wrap items-center gap-2">
          <MediaUploadButton
            kind="article"
            available={options.mediaUploadAvailable}
            articleId={options.articleId}
            onUploaded={(result) => updateAttributes({ src: result.url })}
          />
          <ArticleMediaPicker
            media={options.articleMediaOptions}
            canManageMedia={options.canManageMedia}
            onSelect={(m) => updateAttributes({ src: m.url, alt: m.altText })}
          />
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="Or paste an image URL"
            className="w-full rounded-md border border-border-strong p-2 text-sm focus:border-accent"
          />
          <button
            type="button"
            onClick={() => urlDraft.trim() && updateAttributes({ src: urlDraft.trim() })}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent"
          >
            Use URL
          </button>
        </div>
        <button
          type="button"
          onClick={() => deleteNode()}
          className="mt-2 text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
        >
          Remove
        </button>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="my-4" contentEditable={false}>
      <figure className="rounded-lg border border-border bg-paper-raised p-3">
        {/* Admin-only editing preview — the public renderer (ArticleBody)
         * already uses next/image; a plain <img> here is simpler and
         * avoids the image-domain allowlist question for a mid-edit URL
         * that may not be finalized yet. */}
        <img src={src} alt={alt} className="w-full rounded-md object-cover" />
        <div className="mt-2 flex flex-col gap-2">
          <input
            value={alt}
            onChange={(e) => updateAttributes({ alt: e.target.value })}
            placeholder="Alt text (required)"
            className="w-full rounded-md border border-border-strong p-2 text-sm focus:border-accent"
          />
          <input
            value={caption}
            onChange={(e) => updateAttributes({ caption: e.target.value || null })}
            placeholder="Caption (optional)"
            className="w-full rounded-md border border-border-strong p-2 text-sm focus:border-accent"
          />
          <input
            value={credit}
            onChange={(e) => updateAttributes({ credit: e.target.value || null })}
            placeholder="Credit / license (optional)"
            className="w-full rounded-md border border-border-strong p-2 text-sm focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                updateAttributes({ src: "" });
                setUrlDraft("");
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-accent"
            >
              Replace image
            </button>
            <button
              type="button"
              onClick={() => deleteNode()}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-red-600 hover:border-red-400 dark:text-red-400 dark:hover:border-red-700"
            >
              Remove
            </button>
          </div>
        </div>
      </figure>
    </NodeViewWrapper>
  );
}
