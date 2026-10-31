import Link from "next/link";

/**
 * A small editorial trust callout rendered on every article.
 * Signals to readers (and AdSense reviewers) that TEKZARO is a real,
 * human-edited publication with transparent editorial standards — a key
 * E-E-A-T and AdSense programme policy signal.
 */
export function EditorialStandardsCallout() {
  return (
    <aside
      aria-label="Editorial standards"
      className="mt-8 rounded-lg border border-border/70 bg-paper-raised px-5 py-4 text-sm text-ink-soft"
    >
      <p>
        <span className="font-semibold text-ink">How we report: </span>
        TEKZARO is an independently owned technology publication. Every article
        is written and reviewed by human editors before publication. We do not
        publish unverified automated content.{" "}
        <Link href="/editorial-policy" className="font-semibold text-accent hover:underline">
          Read our Editorial Policy →
        </Link>
      </p>
    </aside>
  );
}
