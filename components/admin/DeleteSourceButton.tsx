"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSourceAction } from "@/lib/source-actions";

export function DeleteSourceButton({ sourceId, sourceName }: { sourceId: string; sourceName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    if (pending) return;
    const confirmed = window.confirm(
      `Delete "${sourceName}"?\n\nThis removes the source configuration. Existing articles/discoveries will not be deleted automatically.`,
    );
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await deleteSourceAction(sourceId);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-xs font-semibold text-ink-muted hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {message && <p className="max-w-[220px] text-right text-[11px] text-ink-muted">{message}</p>}
    </div>
  );
}
