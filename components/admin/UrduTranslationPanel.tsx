"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BlockEditor } from "./BlockEditor";
import {
  requestUrduTranslationAction,
  regenerateUrduTranslationAction,
  updateUrduTranslationAction,
  publishUrduTranslationAction,
  unpublishUrduTranslationAction,
} from "@/lib/urdu-translation-actions";
import type { ContentBlock } from "@/lib/content-blocks";

export interface UrduTranslationPanelProps {
  articleId: string;
  articleSlug: string;
  articleStatus: string;
  initial: {
    status: string;
    title: string | null;
    dek: string | null;
    content: ContentBlock[];
    seoTitle: string | null;
    metaDescription: string | null;
    socialTitle: string | null;
    socialDescription: string | null;
    generatedAt: string | null;
    publishedAt: string | null;
    manuallyEdited: boolean;
    lastEditedAt: string | null;
    failureReason: string | null;
    outdated: boolean;
  };
}

const STATUS_LABEL: Record<string, string> = {
  NOT_REQUESTED: "Not requested",
  QUEUED: "Queued",
  GENERATING: "Generating…",
  READY: "Ready (unpublished)",
  PUBLISHED: "Published",
  FAILED: "Failed",
  OUTDATED: "Outdated",
};

const STATUS_COLOR: Record<string, string> = {
  NOT_REQUESTED: "bg-paper text-ink-muted",
  QUEUED: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  GENERATING: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  READY: "bg-paper-sunken text-ink-soft",
  PUBLISHED: "bg-pakistan-soft text-pakistan",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function UrduTranslationPanel({ articleId, articleSlug, articleStatus, initial }: UrduTranslationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const [title, setTitle] = useState(initial.title ?? "");
  const [dek, setDek] = useState(initial.dek ?? "");
  const [blocks, setBlocks] = useState<ContentBlock[]>(initial.content);
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(initial.metaDescription ?? "");
  const [socialTitle, setSocialTitle] = useState(initial.socialTitle ?? "");
  const [socialDescription, setSocialDescription] = useState(initial.socialDescription ?? "");

  function run(label: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage(result.message);
      if (result.ok) {
        router.refresh();
        if (label === "save") setEditing(false);
      }
    });
  }

  const hasContent = initial.status !== "NOT_REQUESTED" && initial.title !== null;
  const englishPublished = articleStatus === "PUBLISHED";

  return (
    <section className="mt-6 rounded-xl border border-border bg-paper-raised p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Urdu translation</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[initial.status] ?? "bg-paper text-ink-muted"}`}>
          {STATUS_LABEL[initial.status] ?? initial.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {initial.generatedAt && <span>Last generated: {new Date(initial.generatedAt).toLocaleString()}</span>}
        {initial.lastEditedAt && <span>Last manually edited: {new Date(initial.lastEditedAt).toLocaleString()}</span>}
        {initial.manuallyEdited && <span className="font-semibold text-amber-700 dark:text-amber-400">Has manual edits</span>}
        {initial.outdated && <span className="font-semibold text-amber-700 dark:text-amber-400">May be outdated — English was edited since</span>}
      </div>

      {initial.failureReason && (
        <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{initial.failureReason}</p>
      )}
      {!englishPublished && (
        <p className="mt-2 text-xs text-ink-muted">The English article must be published before Urdu can be published — translation and editing still work now.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!hasContent && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run("request", () => requestUrduTranslationAction(articleId))}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {pending ? "Generating…" : "Request Urdu translation"}
          </button>
        )}

        {hasContent && (
          <>
            {initial.manuallyEdited && (
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <input type="checkbox" checked={confirmOverwrite} onChange={(e) => setConfirmOverwrite(e.target.checked)} />
                Overwrite manual edits
              </label>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => run("regenerate", () => regenerateUrduTranslationAction(articleId, confirmOverwrite))}
              className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold hover:border-accent disabled:opacity-50"
            >
              {pending ? "Working…" : "Regenerate"}
            </button>
            <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold hover:border-accent">
              {editing ? "Close editor" : "Edit"}
            </button>
            {initial.status === "PUBLISHED" ? (
              <>
                <a href={`/ur/${articleSlug}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent hover:underline">
                  Preview live →
                </a>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run("unpublish", () => unpublishUrduTranslationAction(articleId))}
                  className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold hover:border-accent disabled:opacity-50"
                >
                  Unpublish Urdu
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={pending || !englishPublished}
                title={englishPublished ? undefined : "The English article must be published first"}
                onClick={() => run("publish", () => publishUrduTranslationAction(articleId))}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
              >
                Publish Urdu
              </button>
            )}
          </>
        )}
      </div>

      {message && <p className="mt-2 text-xs text-ink-muted">{message}</p>}

      {editing && (
        <div className="mt-4 space-y-3 border-t border-border pt-4" dir="rtl">
          <label className="flex flex-col gap-1 text-sm">
            <span dir="ltr" className="text-ink-muted">
              Title (اردو)
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-md border border-border-strong p-2 text-right" lang="ur" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span dir="ltr" className="text-ink-muted">
              Dek / subtitle
            </span>
            <input value={dek} onChange={(e) => setDek(e.target.value)} className="rounded-md border border-border-strong p-2 text-right" lang="ur" />
          </label>
          <div>
            <span dir="ltr" className="text-sm text-ink-muted">
              Body
            </span>
            <div lang="ur" className="mt-1 [&_textarea]:text-right [&_input]:text-right">
              <BlockEditor blocks={blocks} onChange={setBlocks} />
            </div>
          </div>
          <div dir="ltr" className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              SEO title
              <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className="rounded-md border border-border-strong p-2" dir="rtl" lang="ur" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Meta description
              <input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} className="rounded-md border border-border-strong p-2" dir="rtl" lang="ur" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Social title
              <input value={socialTitle} onChange={(e) => setSocialTitle(e.target.value)} className="rounded-md border border-border-strong p-2" dir="rtl" lang="ur" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Social description
              <input value={socialDescription} onChange={(e) => setSocialDescription(e.target.value)} className="rounded-md border border-border-strong p-2" dir="rtl" lang="ur" />
            </label>
          </div>
          <div dir="ltr">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run("save", () =>
                  updateUrduTranslationAction(articleId, { title, dek, seoTitle, metaDescription, socialTitle, socialDescription, blocks }),
                )
              }
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save Urdu content"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
