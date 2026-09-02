"use client";

import { useState } from "react";
import Link from "next/link";
import { navCategoryHref } from "@/lib/category-nav-href";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { ThemePreference } from "@/lib/theme";
import type { Category } from "@prisma/client";

interface MobileMenuProps {
  /** Rendered inside this dropdown instead of the header row — see the note
   * on ThemeToggle for why it doesn't live in the always-visible header
   * below the xl breakpoint. */
  themePreference: ThemePreference;
  categories: Pick<Category, "slug" | "name" | "customRoute">[];
}

export function MobileMenu({ themePreference, categories }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="xl:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-border-strong text-ink"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="absolute inset-x-0 top-full z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-border bg-paper-raised px-4 py-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="text-sm font-semibold text-ink-muted">Theme</span>
            <ThemeToggle initialPreference={themePreference} />
          </div>
          <ul className="flex flex-col divide-y divide-border text-ink">
            <li>
              <Link href="/" className="block py-3 font-semibold" onClick={() => setOpen(false)}>
                Home
              </Link>
            </li>
            <li>
              <Link href="/latest" className="block py-3 font-semibold" onClick={() => setOpen(false)}>
                Latest
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={navCategoryHref(c)} className="block py-3 font-semibold" onClick={() => setOpen(false)}>
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/search" className="block py-3 font-semibold" onClick={() => setOpen(false)}>
                Search
              </Link>
            </li>
            <li>
              <Link href="/newsletter" className="block py-3 font-semibold text-accent" onClick={() => setOpen(false)}>
                Newsletter
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
