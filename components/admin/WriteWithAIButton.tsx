"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { writeWithAIAction, type WriteWithAIResult } from "@/lib/discovery-ai-actions";

/** Cycled on a timer while a generation is pending, purely as a client-side
 * perceived-progress animation — the actual pipeline runs as one awaited
 * server action (this codebase has no background job queue to report real
 * per-stage completion from), so these are not literal server-reported
 * stage transitions. Measured real runs take roughly 25-40 seconds; the
 * interval is tuned so the cycle reaches "Preparing draft…" a little before
 * that, rather than looping back to the start mid-generation. */
const PROGRESS_STAGES = [
  "Preparing sources…",
  "Extracting article…",
  "Building evidence…",
  "Writing article…",
  "Checking claims…",
  "Finding article image…",
  "Preparing draft…",
];
const STAGE_INTERVAL_MS = 4500;

interface WriteWithAIButtonProps {
  itemId: string;
  /** SourceItem.convertedArticleId at page load — presence alone (any
   * status) means a draft already exists for this item. */
  existingArticleId: string | null;
  /** SourceItem.aiStatus at page load — "PROCESSING" here means another
   * request (a second tab, a concurrent editor) already started a
   * generation for this item before this page ever rendered; shown as
   * already-running immediately rather than letting a fresh click race it,
   * ahead of the server's own compare-and-swap catching the same case. */
  initialAiStatus: "NOT_STARTED" | "PROCESSING" | "COMPLETE" | "FAILED";
}

export function WriteWithAIButton({ itemId, existingArticleId, initialAiStatus }: WriteWithAIButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [remoteProcessing, setRemoteProcessing] = useState(initialAiStatus === "PROCESSING");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pending) {
      setStageIndex(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, PROGRESS_STAGES.length - 1));
    }, STAGE_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pending]);

  function run() {
    setError(null);
    startTransition(async () => {
      const result: WriteWithAIResult = await writeWithAIAction(itemId);
      if (!result.ok) {
        if (result.alreadyRunning) setRemoteProcessing(true);
        setError(result.error ?? "Could not generate a draft for this item.");
        return;
      }
      router.push(`/admin/articles/${result.articleId}`);
    });
  }

  if (existingArticleId && !pending) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-pakistan-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-pakistan">
          AI Draft Available
        </span>
        <Link
          href={`/admin/articles/${existingArticleId}`}
          className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft dark:text-paper"
        >
          Open Draft
        </Link>
        <button
          type="button"
          onClick={run}
          disabled={remoteProcessing}
          className="rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold hover:border-accent disabled:opacity-50"
        >
          {remoteProcessing ? "Generating…" : "Generate New Version"}
        </button>
        {error && <p className="w-full max-w-sm text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending || remoteProcessing}
        className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {pending ? PROGRESS_STAGES[stageIndex] : remoteProcessing ? "Generating…" : "Write with AI"}
      </button>
      <p className="text-xs text-ink-muted">
        {pending || remoteProcessing
          ? "This can take 20-40 seconds — evidence is being gathered and verified, not just summarised."
          : "Runs the full pipeline: sources, evidence, synthesis, claim verification, quality gate, and image discovery."}
      </p>
      {error && <p className="max-w-sm text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
