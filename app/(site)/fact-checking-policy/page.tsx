import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fact-Checking Policy",
  description: "TEKZARO's Fact-Checking Policy — how we verify technical claims, benchmark data, and primary sources before publishing.",
  alternates: { canonical: "/fact-checking-policy" },
};

export default function FactCheckingPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Newsroom Verification</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Fact-Checking Policy</h1>
      <p className="mt-2 text-sm text-ink-muted">Published: October 2026</p>

      <div className="prose-article mt-8 space-y-6 text-ink-soft">
        <p>
          In an era of rampant tech hype, algorithmic hallucinations, and unverified viral claims, TEKZARO is committed to rigorous fact-checking. Every article we publish undergoes a systematic verification process to ensure accuracy, technical validity, and objective reporting.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">1. Primary Source Verification</h2>
        <p>
          Before any article is approved for publication, our reporters and editors verify claims against primary sources:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Government &amp; Regulatory Filings:</strong> We pull direct records from bodies such as the Pakistan Telecommunication Authority (PTA), Securities &amp; Exchange Commission of Pakistan (SECP), State Bank of Pakistan (SBP), Ministry of IT &amp; Telecom (MoITT), US Federal Communications Commission (FCC), and global patent offices.</li>
          <li><strong>Direct Corporate Disclosures:</strong> We cross-check company claims with official press releases, SEC/quarterly earnings filings, developer documentation, and verified spokesperson statements.</li>
          <li><strong>Academic &amp; Whitepaper Research:</strong> For AI, cryptography, and computer hardware breakthroughs, we review the underlying research papers (e.g. arXiv, IEEE, ACM) to ensure statistical claims are reported in context.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">2. Multi-Source Corroboration</h2>
        <p>
          For breaking news and investigative reports, a single anonymous post or social media rumor is never sufficient to establish a fact. We require multiple independent sources or verifiable physical/digital evidence (such as regulatory certifications or code commits) before treating an unconfirmed development as confirmed news.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">3. Clear Labeling of Leaks, Rumors &amp; Speculation</h2>
        <p>
          The consumer technology landscape frequently involves unreleased hardware leaks and supply chain rumors. When covering unannounced devices:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We explicitly label unconfirmed reports as <em>&ldquo;Rumor&rdquo;</em>, <em>&ldquo;Leak&rdquo;</em>, or <em>&ldquo;Report&rdquo;</em> in both the headline and body.</li>
          <li>We evaluate the historical accuracy track record of the leaker or supply chain analyst.</li>
          <li>We clearly explain what is confirmed versus what remains unverified speculation.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">4. Technical &amp; Benchmark Integrity</h2>
        <p>
          When reporting on semiconductor performance, GPU speeds, battery endurance, or software benchmarks, our hardware editors evaluate methodology. We do not report vendor-supplied marketing slides uncritically without noting test conditions, comparative baselines, and thermal/power envelopes.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">5. Verification Workflow &amp; Editorial Oversight</h2>
        <p>
          Our newsroom employs an automated and human verification pipeline:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li><strong>Intake:</strong> Raw news discoveries are cross-referenced with origin sources.</li>
          <li><strong>Evidence Bundling:</strong> Primary source URLs, documents, and historical contexts are attached.</li>
          <li><strong>Fact-Check Review:</strong> A senior beat editor verifies core claims, statistics, dates, and spelling of names and technical terms.</li>
          <li><strong>Publication Approval:</strong> Only stories that satisfy our verification checklist are transitioned to live status.</li>
        </ol>

        <h2 className="pt-2 text-2xl font-bold text-ink">Contact the Fact-Checking Desk</h2>
        <p>
          If you believe a claim published on TEKZARO is inaccurate or requires clarification, please email our fact-checking team at{" "}
          <a href="mailto:editorial@tekzaro.co" className="text-accent hover:underline">editorial@tekzaro.co</a>.
        </p>
      </div>
    </div>
  );
}
