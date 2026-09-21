"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revalidateVerificationAction } from "@/lib/article-actions";
import type { RevalidationSummary } from "@/lib/verification-actions";

/** Safety cap on how many rounds one click will auto-continue through — each
 * round is itself time-boxed server-side (see revalidatePublishedArticles),
 * so this only guards against looping forever if something keeps reporting
 * `remaining > 0` without ever making progress. Comfortably above what even
 * a large real backlog should need. */
const MAX_ROUNDS = 50;

function emptyTotals(): Omit<RevalidationSummary, "remaining"> {
  return { targeted: 0, confirmed: 0, stillShort: 0, skippedNoEvidence: 0, failed: 0 };
}

export function RevalidateVerificationButton({ unconfirmedCount }: { unconfirmedCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<Omit<RevalidationSummary, "remaining"> | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  function run() {
    setError(null);
    setDone(false);
    const running = emptyTotals();
    setTotals(running);
    setRemaining(null);

    startTransition(async () => {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const result = await revalidateVerificationAction();
        if (!result.ok || !result.data) {
          setError(result.error ?? "Re-verification failed.");
          return;
        }
        const { remaining: left, ...roundTotals } = result.data;
        running.targeted += roundTotals.targeted;
        running.confirmed += roundTotals.confirmed;
        running.stillShort += roundTotals.stillShort;
        running.skippedNoEvidence += roundTotals.skippedNoEvidence;
        running.failed += roundTotals.failed;
        setTotals({ ...running });
        setRemaining(left);
        router.refresh();

        // Nothing left, or this round couldn't even claim anything new
        // (e.g. every remaining article is stuck failing) — stop either way
        // rather than spinning forever.
        if (left === 0 || roundTotals.targeted === 0) break;
      }
      setDone(true);
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
        Re-verify all published articles ({unconfirmedCount})
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
        One click checks every one of them: articles that already have evidence on file are re-checked against it
        for free, and articles published directly by an editor with nothing on file get one fresh web search each
        (a real cost against the search API) so they can actually be verified instead of skipped. Nothing goes
        offline and no live content changes either way — this only refreshes what the editor view shows about how
        well-sourced each article is. Runs automatically in the background until the whole backlog is done; you can
        close this panel and it will keep going.
      </p>
      {totals && (
        <p className="mt-2 rounded-md bg-white/60 p-2 font-medium text-amber-900 dark:bg-black/20 dark:text-amber-300">
          {pending && !done ? "Running… " : done ? "Finished. " : ""}
          Checked {totals.targeted} so far — {totals.confirmed} now confirmed, {totals.stillShort} still short,{" "}
          {totals.skippedNoEvidence} couldn&apos;t be checked at all (search unavailable), {totals.failed} failed.
          {remaining !== null && remaining > 0 && !pending && ` ${remaining} remaining.`}
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
          {pending ? "Re-verifying…" : `Re-verify all ${unconfirmedCount}`}
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
