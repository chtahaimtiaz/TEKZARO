"use client";

import { useState } from "react";

interface ShareButtonsProps {
  url: string;
  title: string;
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const links = [
    ["X", `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`],
  ] as const;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (older browser or blocked permission) — no-op.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-ink-muted">Share</span>
      {links.map(([label, href]) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
        >
          {label}
        </a>
      ))}
      <button
        type="button"
        onClick={copyLink}
        className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
