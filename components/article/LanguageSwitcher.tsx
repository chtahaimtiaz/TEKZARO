import Link from "next/link";

/**
 * Shown on both the English and Urdu article pages. Only ever links to a
 * language that's actually publicly available — no broken /ur/ link is
 * ever exposed when a translation doesn't exist or isn't published yet.
 */
export function LanguageSwitcher({ slug, current, urduAvailable }: { slug: string; current: "en" | "ur"; urduAvailable: boolean }) {
  return (
    <div className="flex items-center gap-1 text-sm" dir="ltr">
      {current === "en" ? (
        <span className="font-semibold text-ink">English</span>
      ) : (
        <Link href={`/article/${slug}`} className="text-accent hover:underline">
          English
        </Link>
      )}
      <span className="text-ink-muted" aria-hidden>
        |
      </span>
      {current === "ur" ? (
        <span className="font-semibold text-ink" lang="ur">
          اردو
        </span>
      ) : urduAvailable ? (
        <Link href={`/ur/${slug}`} className="text-accent hover:underline" lang="ur">
          اردو
        </Link>
      ) : (
        <span className="text-ink-muted/60" lang="ur" title="Urdu translation not available yet">
          اردو
        </span>
      )}
    </div>
  );
}
