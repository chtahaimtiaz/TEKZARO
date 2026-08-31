import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms governing use of the TEKZARO website.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Terms of Use</h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated: 2026-08-31</p>

      <div className="prose-article mt-8 space-y-5 text-ink-soft">
        <h2 className="text-xl font-bold text-ink">Use of content</h2>
        <p>
          Articles, headlines and original artwork published on TEKZARO are the property of
          TEKZARO unless otherwise credited. You may link to and quote our reporting with
          attribution and a link back to the original article. Republishing full articles requires
          prior written permission.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Acceptable use</h2>
        <p>
          Do not use automated systems to scrape or republish TEKZARO content wholesale, attempt to
          circumvent access controls, or use the site in a way that disrupts its availability for
          other readers.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Accuracy and corrections</h2>
        <p>
          We work to verify stories before publication and correct errors promptly once confirmed.
          Technology news evolves quickly; article content may be updated after initial publication,
          with the update clearly timestamped. See our{" "}
          <a href="/about" className="text-accent hover:underline">
            editorial standards
          </a>{" "}
          for details.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Third-party links</h2>
        <p>
          Articles may link to external sources for attribution and verification. TEKZARO is not
          responsible for the content or availability of external sites we link to.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">No warranty</h2>
        <p>
          TEKZARO is provided &ldquo;as is&rdquo; without warranties of any kind. We make reasonable
          efforts to verify our reporting but do not guarantee that all content is free of error.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Contact</h2>
        <p>
          Questions about these terms can be sent to{" "}
          <a href="mailto:hello@tekzaro.example" className="text-accent hover:underline">
            hello@tekzaro.example
          </a>
          .
        </p>
      </div>
    </div>
  );
}
