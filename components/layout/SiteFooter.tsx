import Link from "next/link";
import { CATEGORIES, SITE_NAME, SITE_DESCRIPTION, categoryHref } from "@/lib/constants";

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
  return (
    <footer className="mt-16 border-t border-border bg-ink text-white/80">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-serif text-xl font-black text-white">{SITE_NAME}</p>
            <p className="mt-3 max-w-xs text-sm">{SITE_DESCRIPTION}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50">Sections</p>
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
            <p className="text-xs font-bold uppercase tracking-wide text-white/50">Company</p>
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
            <p className="text-xs font-bold uppercase tracking-wide text-white/50">Legal</p>
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

        <div className="mt-10 border-t border-white/10 pt-6 text-xs text-white/50">
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
