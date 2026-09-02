import Link from "next/link";
import { CATEGORY_MAP, PRIMARY_NAV, OVERFLOW_NAV, SITE_NAME, categoryHref } from "@/lib/constants";
import { MobileMenu } from "./MobileMenu";
import { MoreMenu } from "./MoreMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Logo } from "@/components/ui/Logo";
import { getThemePreference } from "@/lib/theme";

export async function SiteHeader() {
  const themePreference = await getThemePreference();

  return (
    <header className="relative border-b border-border bg-paper-raised text-ink">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4">
        <Link href="/" className="flex items-center gap-2 font-serif text-2xl font-black tracking-tight">
          <Logo size={36} priority />
          {SITE_NAME}
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-5 text-sm font-semibold xl:flex">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>
          <Link href="/latest" className="hover:text-accent">
            Latest
          </Link>
          {PRIMARY_NAV.map((slug) => (
            <Link key={slug} href={categoryHref(slug)} className="hover:text-accent">
              {CATEGORY_MAP[slug].name}
            </Link>
          ))}
          <MoreMenu slugs={OVERFLOW_NAV} />
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden xl:block">
            <ThemeToggle initialPreference={themePreference} />
          </div>
          <Link
            href="/search"
            aria-label="Search TEKZARO"
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-border-strong hover:border-accent hover:text-accent sm:flex"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Link>
          <Link
            href="/newsletter"
            className="hidden rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark dark:text-paper sm:block"
          >
            Newsletter
          </Link>
          <MobileMenu themePreference={themePreference} />
        </div>
      </div>
    </header>
  );
}
