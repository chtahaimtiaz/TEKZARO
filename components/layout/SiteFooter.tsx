import type { ReactNode } from "react";
import Link from "next/link";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";
import { getAllNavCategories } from "@/lib/categories";
import { navCategoryHref } from "@/lib/category-nav-href";
import { getConfiguredSocialLinks, type SocialPlatform } from "@/lib/social-links";
import { Logo } from "@/components/ui/Logo";

/**
 * Complete, self-contained SVG for each social platform.
 * Follows clean, professional line-art and brand-accurate glyph conventions.
 */
const SOCIAL_ICONS: Record<SocialPlatform, ReactNode> = {
  // Instagram: rounded camera with lens circle and flash dot
  instagram: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" strokeWidth="2.5" />
    </svg>
  ),
  // Facebook: classic letterform
  facebook: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  ),
  // X (formerly Twitter): official brand mark
  x: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  // YouTube: official pill shape with center play arrow
  youtube: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" stroke="none" />
    </svg>
  ),
  // TikTok: official note glyph
  tiktok: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  ),
  // LinkedIn: standard badge with in
  linkedin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
};

const COMPANY_LINKS = [
  ["About Us", "/about"],
  ["Contact", "/contact"],
  ["Authors & Staff", "/authors"],
  ["Editorial Policy", "/editorial-policy"],
  ["Fact-Checking", "/fact-checking-policy"],
  ["Corrections", "/corrections-policy"],
  ["Ethics & Ownership", "/ethics-policy"],
  ["Advertise", "/advertise"],
  ["Newsletter", "/newsletter"],
];

const LEGAL_LINKS = [
  ["Privacy Policy", "/privacy"],
  ["Terms of Use", "/terms"],
  ["Cookie Policy", "/cookie-policy"],
];

export async function SiteFooter() {
  const socialLinks = getConfiguredSocialLinks();
  const categories = await getAllNavCategories();

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
              {categories.map((c) => {
                const displayName = c.slug === "pakistan-tech" || c.name === "Pakistan Tech" ? "Pakistan" : c.name;
                return (
                  <li key={c.slug}>
                    <Link href={navCategoryHref(c)} className="hover:text-accent">
                      {displayName}
                    </Link>
                  </li>
                );
              })}
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
                {SOCIAL_ICONS[link.platform]}
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
