"use client";

import { useState } from "react";
import { setThemeAction } from "@/lib/theme-actions";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5l-1.1-1.1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M13.8 9.3A5.8 5.8 0 1 1 6.7 2.2a4.6 4.6 0 0 0 7.1 7.1Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 14.5h5M8 11v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

interface ThemeToggleProps {
  /** From the server-rendered parent (SiteHeader / admin layout / mobile
   * menu), which already reads getThemePreference() — avoids a
   * client-side cookie read that would mismatch the server-rendered
   * markup during hydration. */
  initialPreference: ThemePreference;
}

function applyTheme(pref: ThemePreference): void {
  if (pref === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = pref;
  }
}

/** Icon-only by design, not a space-saving afterthought — three full text
 * labels ("Light"/"Dark"/"System") made this control too wide to coexist
 * with the logo and the mobile menu button on narrow screens (it was
 * pushing the menu button off-screen below ~430px). Icons keep this one
 * fixed width at every viewport instead of needing separate responsive
 * variants; aria-label/title keep the meaning available to screen readers
 * and on hover. */
export function ThemeToggle({ initialPreference }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  function choose(pref: ThemePreference) {
    if (pref === preference) return;
    setPreference(pref);
    applyTheme(pref);
    void setThemeAction(pref);
  }

  return (
    <div role="radiogroup" aria-label="Color theme" className="inline-flex shrink-0 rounded-full border border-border-strong p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={preference === opt.value}
          aria-label={opt.label}
          title={opt.label}
          onClick={() => choose(opt.value)}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            preference === opt.value ? "bg-accent text-white dark:text-paper" : "text-ink-muted hover:text-ink"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
