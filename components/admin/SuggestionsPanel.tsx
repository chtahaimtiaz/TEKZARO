"use client";

import { useState, useTransition } from "react";
import { generateHeadlineSuggestions, type HeadlineSuggestion } from "@/lib/discovery/headlines";
import { suggestInternalLinksAction } from "@/lib/editor-actions";
import type { InternalLinkSuggestion } from "@/lib/internal-links";
import { siteUrl } from "@/lib/constants";

interface SuggestionsPanelProps {
  title: string;
  excerpt: string;
  categoryId: string | null;
  tagNames: string[];
  articleId?: string;
  onSelectHeadline: (headline: string) => void;
  onInsertLink: (text: string) => void;
}

export function SuggestionsPanel({
  title,
  excerpt,
  categoryId,
  tagNames,
  articleId,
  onSelectHeadline,
  onInsertLink,
}: SuggestionsPanelProps) {
  const [headlines, setHeadlines] = useState<HeadlineSuggestion[] | null>(null);
  const [links, setLinks] = useState<InternalLinkSuggestion[] | null>(null);
  const [pending, startTransition] = useTransition();

  function suggestHeadlines() {
    setHeadlines(generateHeadlineSuggestions(title || "Untitled", excerpt));
  }

  function suggestLinks() {
    startTransition(async () => {
      setLinks(await suggestInternalLinksAction({ excludeArticleId: articleId, categoryId, tagNames, title }));
    });
  }

  return (
    <div className="rounded-xl border border-border bg-paper-raised p-4">
      <p className="mb-3 text-sm font-bold">Suggestions</p>

      <div className="mb-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Headlines (rule-based)</p>
          <button type="button" onClick={suggestHeadlines} className="text-xs font-semibold text-accent hover:underline">
            Suggest
          </button>
        </div>
        {headlines && (
          <ul className="flex flex-col gap-1.5">
            {headlines.map((h) => (
              <li key={h.style}>
                <button
                  type="button"
                  onClick={() => onSelectHeadline(h.headline)}
                  className="w-full rounded-md border border-border-strong p-2 text-left text-xs hover:border-accent"
                >
                  <span className="mb-0.5 block font-semibold text-ink-muted">{h.label}</span>
                  {h.headline}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Related TEKZARO articles</p>
          <button type="button" onClick={suggestLinks} disabled={pending} className="text-xs font-semibold text-accent hover:underline disabled:opacity-50">
            {pending ? "Loading…" : "Suggest"}
          </button>
        </div>
        {links && links.length === 0 && <p className="text-xs text-ink-muted">No related published articles found.</p>}
        {links && links.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-strong p-2 text-xs">
                <span>
                  {l.title} <span className="text-ink-muted">({l.categoryName})</span>
                </span>
                <button
                  type="button"
                  onClick={() => onInsertLink(`Related: ${l.title} — ${siteUrl()}/article/${l.slug}`)}
                  className="shrink-0 font-semibold text-accent hover:underline"
                >
                  Insert
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
