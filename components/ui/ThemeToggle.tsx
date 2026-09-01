"use client";

import { useState, useTransition } from "react";
import { setThemeAction } from "@/lib/theme-actions";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

interface ThemeToggleProps {
  /** From the server-rendered parent (SiteHeader / admin layout), which
   * already reads getThemePreference() — avoids a client-side cookie read
   * that would mismatch the server-rendered markup during hydration. */
  initialPreference: ThemePreference;
}

function applyTheme(pref: ThemePreference): void {
  if (pref === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = pref;
  }
}

export function ThemeToggle({ initialPreference }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [, startTransition] = useTransition();

  function choose(pref: ThemePreference) {
    if (pref === preference) return;
    setPreference(pref);
    applyTheme(pref);
    startTransition(() => {
      setThemeAction(pref);
    });
  }

  return (
    <div role="radiogroup" aria-label="Color theme" className="inline-flex rounded-full border border-border-strong p-0.5 text-xs font-semibold">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={preference === opt.value}
          onClick={() => choose(opt.value)}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            preference === opt.value ? "bg-accent text-white dark:text-paper" : "text-ink-muted hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
