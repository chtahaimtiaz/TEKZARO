"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAllArticlesAction } from "@/lib/article-actions";

const CONFIRMATION_PHRASE = "DELETE ALL ARTICLES";

export function DeleteAllArticlesButton({ articleCount }: { articleCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setTyped("");
    setMessage(null);
  }

  function run() {
    if (pending || typed !== CONFIRMATION_PHRASE) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deleteAllArticlesAction(typed);
      if (result.ok) {
        setOpen(false);
        setTyped("");
        router.refresh();
      } else {
        setMessage(result.error ?? "Something went wrong.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={articleCount === 0}
        className="rounded-md border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete all articles
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
      <p className="font-bold text-red-800 dark:text-red-300">
        Delete all {articleCount} article{articleCount === 1 ? "" : "s"}?
      </p>
      <p className="mt-1 text-sm text-red-700 dark:text-red-400">
        This permanently removes every article — drafts and published alike — and cannot be undone. Categories,
        authors, sources, and discovery data are not affected.
      </p>
      <label className="mt-3 flex flex-col gap-1 text-sm text-red-800 dark:text-red-300">
        Type <span className="font-mono font-bold">{CONFIRMATION_PHRASE}</span> to confirm:
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="rounded-md border border-red-300 bg-white p-2 font-mono text-ink dark:border-red-800 dark:bg-paper-raised"
          autoFocus
        />
      </label>
      {message && <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-400">{message}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={run}
          disabled={pending || typed !== CONFIRMATION_PHRASE}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Permanently delete all articles"}
        </button>
        <button type="button" onClick={close} disabled={pending} className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold hover:border-accent">
          Cancel
        </button>
      </div>
    </div>
  );
}
