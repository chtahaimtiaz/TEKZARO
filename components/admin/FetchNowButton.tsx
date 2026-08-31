"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchSourceAction } from "@/lib/source-actions";

export function FetchNowButton({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await fetchSourceAction(sourceId);
      if (!result.ok) {
        setMessage(`Failed: ${result.error}`);
      } else {
        setMessage(
          `Fetched ${result.itemsSeen} item(s) — ${result.itemsCreated} new, ${result.itemsSkippedExisting} already known.`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold hover:border-accent disabled:opacity-50"
      >
        {pending ? "Fetching…" : "Fetch now"}
      </button>
      {message && <p className="max-w-[220px] text-right text-[11px] text-ink-muted">{message}</p>}
    </div>
  );
}
