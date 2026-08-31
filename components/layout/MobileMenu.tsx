"use client";

import { useState } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/constants";
import { categoryHref } from "@/lib/constants";

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-white/20 text-white"
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
        <nav id="mobile-nav" aria-label="Mobile" className="absolute inset-x-0 top-full z-40 border-t border-white/10 bg-ink px-4 py-4 shadow-xl">
          <ul className="flex flex-col divide-y divide-white/10 text-white">
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
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link href={categoryHref(c.slug)} className="block py-3 font-semibold" onClick={() => setOpen(false)}>
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
