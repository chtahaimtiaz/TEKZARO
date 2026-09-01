"use client";

import { useState } from "react";
import { generateSocialPosts, type SocialPostDraft } from "@/lib/social-posts";

interface SocialPostPanelProps {
  title: string;
  excerpt: string;
  categoryName: string;
  tagNames: string[];
  url: string;
  pakistanRelevance: number;
}

function PostBlock({ draft, onChange }: { draft: SocialPostDraft; onChange: (text: string) => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — no-op, same as ShareButtons.tsx.
    }
  }

  return (
    <div className="rounded-md border border-border-strong p-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-soft">{draft.label}</span>
        <button type="button" onClick={copy} className="text-xs font-semibold text-accent hover:underline">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <textarea
        value={draft.text}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-border-strong p-2 text-xs"
      />
    </div>
  );
}

/**
 * Manual-publish-only social copy generation — no platform APIs, no
 * auto-posting. Deterministic (lib/social-posts.ts), not an AI task: see
 * that module's own doc comment for why. Editable before copying, same
 * Clipboard-API pattern as components/content/ShareButtons.tsx.
 */
export function SocialPostPanel({ title, excerpt, categoryName, tagNames, url, pakistanRelevance }: SocialPostPanelProps) {
  const [drafts, setDrafts] = useState<SocialPostDraft[] | null>(null);

  function generate() {
    setDrafts(generateSocialPosts({ title: title || "Untitled", excerpt, categoryName, tagNames, url, pakistanRelevance }));
  }

  function updateDraft(platform: SocialPostDraft["platform"], text: string) {
    setDrafts((prev) => prev && prev.map((d) => (d.platform === platform ? { ...d, text } : d)));
  }

  return (
    <div className="rounded-xl border border-border bg-paper-raised p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">Social Media</p>
        <button type="button" onClick={generate} className="text-xs font-semibold text-accent hover:underline">
          {drafts ? "Regenerate" : "Generate"}
        </button>
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        Draft copy for manual posting — edit before you copy. Nothing here posts automatically.
      </p>
      {drafts && (
        <div className="flex flex-col gap-3">
          {drafts.map((d) => (
            <PostBlock key={d.platform} draft={d} onChange={(text) => updateDraft(d.platform, text)} />
          ))}
        </div>
      )}
    </div>
  );
}
