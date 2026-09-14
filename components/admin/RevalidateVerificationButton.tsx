"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revalidateVerificationAction } from "@/lib/article-actions";
import type { RevalidationSummary } from "@/lib/verification-actions";

const BATCH_SIZE = 10;

export function RevalidateVerificationButton({ unconfirmedCount }: { unconfirmedCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<RevalidationSummary | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await revalidateVerificationAction(BATCH_SIZE);
      if (!result.ok || !result.data) {
        setError(result.error ?? "Re-verification failed.");
        return;
      }
      setLastRun(result.data);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={unconfirmedCount === 0}
        className="rounded-md border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
      >
        Re-verify published articles ({unconfirmedCount})
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
      <p className="font-bold text-amber-900 dark:text-amber-300">
        {unconfirmedCount} published article{unconfirmedCount === 1 ? "" : "s"} still short of a confirmed primary
        source
      </p>
      <p className="mt-1 text-amber-800 dark:text-amber-400">
        Re-checks evidence for up to {BATCH_SIZE} of them against current sources and updates their verification
        status. Nothing goes offline and no live content changes either way — this only refreshes what the editor
        view shows about how well-sourced each article is. Uses one search + one AI call per article; click again
        for the next batch.
      </p>
      {lastRun && (
        <p className="mt-2 rounded-md bg-white/60 p-2 font-medium text-amber-900 dark:bg-black/20 dark:text-amber-300">
          Last batch: {lastRun.targeted} checked — {lastRun.confirmed} now confirmed, {lastRun.stillShort} still
          short, {lastRun.skippedNoSourceItem} skipped (no linked source), {lastRun.failed} failed.
        </p>
      )}
      {error && <p className="mt-2 font-medium text-red-700 dark:text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={run}
          disabled={pending || unconfirmedCount === 0}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
        >
          {pending ? "Re-verifying…" : `Re-verify next ${Math.min(BATCH_SIZE, unconfirmedCount)}`}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold hover:border-accent"
        >
          Close
        </button>
      </div>
    </div>
  );
}
