"use client";

import { useState, useTransition } from "react";
import { improveArticleAction } from "@/lib/article-ai-actions";

interface ImproveArticleButtonProps {
  articleId: string;
}

/**
 * AI assistance on an article that already exists — distinct from Discovery
 * synthesis (WriteWithAIButton). Explicit and reversible: applying an
 * improvement snapshots the pre-improvement content as a real, restorable
 * version first (see improveArticleAction), the same version-history
 * mechanism every other edit already produces.
 *
 * A full page reload on success, deliberately, rather than trying to hot-swap
 * ArticleEditor's internal state in place: that component seeds its local
 * state from props once at mount, so a router.refresh() alone would leave
 * stale form state next to freshly-fetched (but unused) server data. A
 * reload is the simple, unambiguously-correct way to guarantee what the
 * editor sees next is exactly what is now in the database.
 */
export function ImproveArticleButton({ articleId }: ImproveArticleButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await improveArticleAction(articleId);
      if (!result.ok) {
        setError(result.error ?? "Could not improve this article.");
        return;
      }
      window.location.reload();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold hover:border-accent disabled:opacity-50"
      >
        {pending ? "Improving…" : "Improve with AI"}
      </button>
      <p className="text-xs text-ink-muted">
        Rewrites for clarity using only facts already in this article or its evidence. Reversible — restores as a version if you don&apos;t like it.
      </p>
      {error && <p className="max-w-sm text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
