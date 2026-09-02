"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchAllSourcesAction } from "@/lib/source-actions";

export function FetchAllButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    if (pending) return; // guards against a double-click queuing a second overlapping batch
    setMessage(null);
    startTransition(async () => {
      const summary = await fetchAllSourcesAction();
      setMessage(
        `Fetch All complete — ${summary.sourcesChecked} source(s) attempted, ${summary.sourcesChecked - summary.sourcesFailed} succeeded, ` +
          `${summary.sourcesFailed} failed. ${summary.itemsCreated} new discoveries, ${summary.itemsSkippedExisting} already known.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {pending ? "Fetching all…" : "Fetch All"}
      </button>
      {message && <p className="max-w-xs text-right text-xs text-ink-muted">{message}</p>}
    </div>
  );
}
