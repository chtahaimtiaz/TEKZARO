import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Editorial Policy",
  description: "TEKZARO's Editorial Policy — our standards for technology journalism, sourcing, AI transparency, and editorial integrity.",
  alternates: { canonical: "/editorial-policy" },
};

export default function EditorialPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Standards &amp; Practices</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Editorial Policy</h1>
      <p className="mt-2 text-sm text-ink-muted">Published: October 2026</p>

      <div className="prose-article mt-8 space-y-6 text-ink-soft">
        <p>
          TEKZARO is dedicated to producing independent, fact-checked, and deeply researched technology journalism. Our core editorial mission is to examine how technology, artificial intelligence, telecommunications, computing hardware, and digital policy shape South Asia and the broader global economy.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">1. Pakistan First, Globally Informed</h2>
        <p>
          We prioritize Pakistani and regional technology developments because we believe local engineering ecosystems, startup founders, telecom regulations, and technical talent deserve rigorous, dedicated journalism. When covering global technology stories (such as frontier AI model releases, semiconductor roadmaps, or consumer hardware breakthroughs), we analyze the tangible, evidenced implications for local developers, consumers, and businesses.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">2. Editorial Independence &amp; Commercial Separation</h2>
        <p>
          TEKZARO maintains a strict separation between our editorial newsroom and commercial advertising operations:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Advertisers, sponsors, and investors never review articles prior to publication.</li>
          <li>Commercial relationships never dictate which products, startups, or platforms we review or investigate.</li>
          <li>Any sponsored or partner content is visibly labeled with a &ldquo;Sponsored&rdquo; tag and presented in distinct formatting to prevent confusion with independent editorial coverage.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">3. Sourcing &amp; Attribution Standards</h2>
        <p>
          We hold our reporting to rigorous verification standards:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Primary Sources:</strong> We prioritize firsthand evidence — official regulatory filings (e.g. SECP, PTA, SBP, FCC), direct company statements, peer-reviewed research papers, technical documentation, and firsthand interviews.</li>
          <li><strong>Original Reporting Credit:</strong> When an article builds upon reporting first uncovered by another credible news organization, we prominently credit and link directly to the originating outlet. We never scrape, rephrase, or aggregate secondary reporting without clear attribution.</li>
          <li><strong>No Anonymous Inventions:</strong> We do not fabricate quotes, composite characters, or anonymous experts. Quotes are verified directly from public record or direct conversation.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">4. Responsible AI Usage &amp; Human-in-the-Loop Review</h2>
        <p>
          As a publication covering the artificial intelligence industry, we treat AI with transparency and accountability:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Every published story on TEKZARO is authored, reviewed, fact-checked, and validated by professional human journalists.</li>
          <li>We prohibit uncontrolled autonomous publishing. Any automated assistance used during news gathering or preliminary transcription is strictly subjected to human editorial scrutiny, claim verification, and stylistic editing.</li>
          <li>We strictly forbid AI-generated hallucinations, fabricated citations, and deceptive synthetic imagery.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">5. Product Reviews &amp; Technical Benchmarks</h2>
        <p>
          When reviewing smartphones, PCs, processors, smart hardware, or software platforms:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We test products using objective technical benchmarks, real-world battery tests, and systematic usability workflows.</li>
          <li>Review units provided by manufacturers do not guarantee positive reviews. We disclose when a product has been tested via loaner hardware.</li>
          <li>Our verdicts are grounded in value, durability, privacy, and real-world consumer utility.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">6. Editorial Accountability</h2>
        <p>
          Our editors and staff are held to the highest standards of professional conduct. For details on how we verify claims and correct mistakes, please read our dedicated{" "}
          <Link href="/fact-checking-policy" className="text-accent hover:underline">Fact-Checking Policy</Link> and{" "}
          <Link href="/corrections-policy" className="text-accent hover:underline">Corrections Policy</Link>.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Editorial Inquiries</h2>
        <p>
          To contact our newsroom, pitch a technology story, or submit a press release, please reach out to our editorial desk at{" "}
          <a href="mailto:editorial@tekzaro.co" className="text-accent hover:underline">editorial@tekzaro.co</a>.
        </p>
      </div>
    </div>
  );
}
