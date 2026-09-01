import type { ReactNode } from "react";
import Link from "next/link";
import { CATEGORIES, SITE_NAME, SITE_DESCRIPTION, categoryHref } from "@/lib/constants";
import { getConfiguredSocialLinks, type SocialPlatform } from "@/lib/social-links";
import { Logo } from "@/components/ui/Logo";

// Simple, hand-rolled line-icon glyphs (fill="none"/stroke="currentColor"),
// matching this project's existing icon convention (SiteHeader.tsx,
// MobileMenu.tsx) rather than pulling in an icon library for four icons.
// Recognizable at a glance, not a pixel-exact trace of each platform's mark.
const SOCIAL_ICON_PATHS: Record<SocialPlatform, ReactNode> = {
  instagram: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  facebook: <path d="M14 8.5h-1.5a1.5 1.5 0 0 0-1.5 1.5v1h3M11 11v6.5" strokeLinecap="round" strokeLinejoin="round" />,
  tiktok: (
    <path
      d="M13 7v7.2a2.3 2.3 0 1 1-2.3-2.3c.3 0 .6.05.9.14M13 7c.4 1.3 1.5 2.2 2.8 2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  x: <path d="M8 8l8 8M16 8l-8 8" strokeLinecap="round" />,
};

const COMPANY_LINKS = [
  ["About", "/about"],
  ["Contact", "/contact"],
  ["Advertise", "/advertise"],
  ["Newsletter", "/newsletter"],
  ["Authors", "/authors"],
];

const LEGAL_LINKS = [
  ["Privacy Policy", "/privacy"],
  ["Terms of Use", "/terms"],
  ["Cookie Policy", "/cookie-policy"],
];

export function SiteFooter() {
  const socialLinks = getConfiguredSocialLinks();

  return (
    <footer className="mt-16 border-t border-border bg-paper-raised text-ink-soft">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Logo size={28} />
              <p className="font-serif text-xl font-black text-ink">{SITE_NAME}</p>
            </div>
            <p className="mt-3 max-w-xs text-sm">{SITE_DESCRIPTION}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Sections</p>
            <ul className="mt-3 space-y-2 text-sm">
              {CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <Link href={categoryHref(c.slug)} className="hover:text-accent">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Company</p>
            <ul className="mt-3 space-y-2 text-sm">
              {COMPANY_LINKS.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-accent">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Legal</p>
            <ul className="mt-3 space-y-2 text-sm">
              {LEGAL_LINKS.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-accent">
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/rss.xml" className="hover:text-accent">
                  RSS
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {socialLinks.length > 0 && (
          <div className="mt-10 flex items-center gap-2 border-t border-border pt-6">
            {socialLinks.map((link) => (
              <a
                key={link.platform}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong hover:border-accent hover:text-accent"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  {SOCIAL_ICON_PATHS[link.platform]}
                </svg>
              </a>
            ))}
          </div>
        )}

        <div className={`${socialLinks.length > 0 ? "mt-6" : "mt-10 border-t border-border pt-6"} text-xs text-ink-muted`}>
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
