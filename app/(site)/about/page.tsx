import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "About TEKZARO — Pakistan-first technology journalism with global coverage.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="eyebrow">About</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">About TEKZARO</h1>

      <div className="prose-article mt-8 space-y-5 text-ink-soft">
        <p>
          TEKZARO is an independent technology news publication built around one idea: Pakistan
          deserves technology journalism that treats it as the main story, not an afterthought to
          global coverage. We report on artificial intelligence, smartphones, computing, gadgets,
          cybersecurity, software, gaming, startups, space and science, and enterprise technology —
          with Pakistani developments given first priority, regional developments second, and
          global technology news covered in context third.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Pakistan First, Globally Informed</h2>
        <p>
          When a global story has a genuine, evidenced effect on Pakistani consumers, businesses,
          developers, freelancers or policy, we say so explicitly. When it doesn&apos;t, we don&apos;t force
          a connection that isn&apos;t there. Our full editorial priority strategy is published as part
          of our engineering documentation and governs how stories are ranked across the homepage,
          breaking-news ticker, search and newsletter.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Editorial Standards</h2>
        <p>
          Every published article passes through human editorial review before it goes live —
          including stories that begin as AI-assisted drafts. We separate verified facts from
          claims that still require confirmation, and we do not present speculation as fact. We do
          not fabricate quotes, statistics, sources or experts, and we do not publish images without
          a known license.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Corrections Policy</h2>
        <p>
          When we get something wrong, we fix it. Substantive corrections are noted with an
          &ldquo;Updated&rdquo; timestamp on the article, visibly distinct from the original publish time.
          If you believe a TEKZARO article contains an error, contact us at{" "}
          <a href="mailto:editorial@tekzaro.co" className="text-accent hover:underline">
            editorial@tekzaro.co
          </a>
          .
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Source &amp; Attribution Policy</h2>
        <p>
          TEKZARO treats other publications and official sources as research material, not content
          to copy. Where our reporting builds on another outlet&apos;s original work, we link to and
          credit that outlet rather than reproducing it. We prefer primary sources — official
          statements, regulatory filings, company newsrooms — for important claims, and we flag
          conflicting reports rather than picking one silently.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">News, Analysis, Opinion and Sponsored Content</h2>
        <p>
          We label our content by type. Reported news, editorial analysis and opinion pieces are
          clearly distinguished from one another, and any sponsored content is always labeled as
          such and is never presented as independent journalism.
        </p>
      </div>
    </div>
  );
}
