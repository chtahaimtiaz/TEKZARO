"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CATEGORY_MAP, categoryHref, type CategorySlug } from "@/lib/constants";

interface MoreMenuProps {
  slugs: CategorySlug[];
}

/** Replaces a native <details>/<summary> — that closed on outside click only
 * inconsistently across browsers, never on Escape, and never on client-side
 * navigation (its `open` attribute is DOM state, not tied to the route). */
export function MoreMenu({ slugs }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer hover:text-accent"
      >
        More
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-48 rounded-lg border border-border bg-paper-raised p-2 shadow-xl">
          {slugs.map((slug) => (
            <Link
              key={slug}
              href={categoryHref(slug)}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm hover:bg-paper-sunk hover:text-accent"
            >
              {CATEGORY_MAP[slug].name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
