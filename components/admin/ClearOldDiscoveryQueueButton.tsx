"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearOldDiscoveryQueueAction } from "@/lib/discovery-actions";

export function ClearOldDiscoveryQueueButton({ eligibleCount }: { eligibleCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await clearOldDiscoveryQueueAction();
      if (result.ok) {
        setOpen(false);
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
        disabled={eligibleCount === 0}
        className="rounded-md border border-border-strong px-3 py-2 text-sm font-semibold text-ink-soft hover:border-accent hover:text-ink disabled:opacity-40"
      >
        Clear queue ({eligibleCount} older than 1h)
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
      <p className="font-bold text-amber-900 dark:text-amber-300">
        Remove {eligibleCount} item{eligibleCount === 1 ? "" : "s"} from the discovery queue?
      </p>
      <p className="mt-1 text-amber-800 dark:text-amber-400">
        This permanently deletes discovery items discovered more than 1 hour ago (any item still protected by a
        scheduled article is skipped). It never touches articles, drafts, or already-published stories — Discovery
        is just a working queue, not the source of truth for content.
      </p>
      {message && <p className="mt-2 font-medium text-red-700 dark:text-red-400">{message}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={run}
          disabled={pending || eligibleCount === 0}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
        >
          {pending ? "Clearing…" : "Clear queue"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold hover:border-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
