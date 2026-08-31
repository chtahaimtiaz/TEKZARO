"use client";

import { useState, useTransition } from "react";

interface AITaskResult {
  ok: boolean;
  text?: string;
  notConfigured?: boolean;
  error?: string;
}

interface AIAssistPanelProps {
  title: string;
  buttonLabel: string;
  action: () => Promise<AITaskResult>;
}

export function AIAssistPanel({ title, buttonLabel, action }: AIAssistPanelProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AITaskResult | null>(null);

  function run() {
    startTransition(async () => {
      setResult(await action());
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-border-strong p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">{title}</p>
        <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          AI-assisted
        </span>
      </div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold hover:border-accent disabled:opacity-50"
      >
        {pending ? "Generating…" : buttonLabel}
      </button>

      {result && !result.ok && result.notConfigured && (
        <p className="mt-3 text-sm text-ink-muted">AI assistance not configured — add AI_API_KEY in .env to enable this.</p>
      )}
      {result && !result.ok && !result.notConfigured && (
        <p className="mt-3 text-sm text-red-600">{result.error}</p>
      )}
      {result?.ok && result.text && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-paper p-3 text-sm text-ink-soft">{result.text}</p>
      )}
    </div>
  );
}
