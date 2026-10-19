import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Corrections Policy",
  description: "TEKZARO's Corrections Policy — our commitment to transparency, prompt error corrections, and newsroom accountability.",
  alternates: { canonical: "/corrections-policy" },
};

export default function CorrectionsPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Newsroom Transparency</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Corrections Policy</h1>
      <p className="mt-2 text-sm text-ink-muted">Published: October 2026</p>

      <div className="prose-article mt-8 space-y-6 text-ink-soft">
        <p>
          At TEKZARO, accuracy is fundamental to our journalism. We strive to be thorough, precise, and fair in every technology report, benchmark analysis, and news story we publish. However, journalism moves quickly, and when mistakes occur, we take full responsibility and correct them promptly and transparently.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Our Standards for Corrections</h2>
        <p>
          We do not quietly overwrite or &ldquo;stealth edit&rdquo; substantive factual errors. When an article requires a meaningful correction:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Visible Update Timestamp:</strong> The article displays an updated timestamp alongside the original publication time.</li>
          <li><strong>Correction Notice:</strong> A clear correction note is appended at the top or bottom of the article specifying what was inaccurate, what the correct information is, and the date the correction was made.</li>
          <li><strong>Headline &amp; Excerpt Updates:</strong> If a headline or excerpt contained an inaccurate claim, it is revised immediately, and the correction note explains the change.</li>
          <li><strong>Minor Typographical Edits:</strong> Minor spelling, grammatical, or typographical fixes that do not alter the factual meaning of a sentence may be corrected directly without an explicit correction note.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">Retractions &amp; Major Revisions</h2>
        <p>
          In the rare event that an entire story is found to be based on fraudulent documentation, unverified claims that were debunked after publication, or fundamentally misleading evidence, TEKZARO will issue a formal Retraction. The original URL will remain accessible with an editor&apos;s note explaining why the piece was retracted, rather than disappearing into a 404 error.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">How to Request a Correction</h2>
        <p>
          We welcome feedback and corrections from readers, companies, developers, and researchers. If you spot a factual error in any TEKZARO story:
        </p>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="font-bold text-ink">Submit a Correction Request:</p>
          <p className="mt-2 text-sm text-ink-soft">
            Email:{" "}
            <a href="mailto:editorial@tekzaro.co?subject=Correction%20Request" className="font-semibold text-accent hover:underline">
              editorial@tekzaro.co
            </a>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Subject line: <strong>Correction Request: [Article Title or URL]</strong>
          </p>
          <div className="mt-3 text-sm text-ink-soft">
            Please include:
            <ul className="mt-1 list-disc pl-5 space-y-1">
              <li>The specific URL and paragraph where the error appears</li>
              <li>The exact factual inaccuracy</li>
              <li>Supporting evidence or primary source documentation verifying the correct facts</li>
            </ul>
          </div>
        </div>

        <h2 className="pt-2 text-2xl font-bold text-ink">Review Turnaround</h2>
        <p>
          Our editorial team reviews all correction requests within 24 to 48 business hours. If a substantive error is verified, the article is updated immediately and the correction logged.
        </p>
      </div>
    </div>
  );
}
