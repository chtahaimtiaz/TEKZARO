import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ethics & Ownership Policy",
  description: "TEKZARO's Code of Ethics, Journalistic Standards, Conflicts of Interest, and Ownership Transparency.",
  alternates: { canonical: "/ethics-policy" },
};

export default function EthicsPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Governance &amp; Trust</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Ethics &amp; Ownership Policy</h1>
      <p className="mt-2 text-sm text-ink-muted">Published: October 2026</p>

      <div className="prose-article mt-8 space-y-6 text-ink-soft">
        <p>
          TEKZARO operates under a strict code of journalistic ethics to preserve reader trust, maintain editorial independence, and deliver uncompromised technology journalism.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">1. Ownership &amp; Funding Transparency</h2>
        <p>
          TEKZARO is an independent technology media publication founded and operated by Taha Imtiaz. Our operations are funded through direct display advertising and commercial partnerships.
        </p>
        <p>
          No single investor, tech corporation, political organization, or government agency holds an ownership stake in TEKZARO or dictates our editorial decisions. We retain 100% editorial control over all published journalism.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">2. Conflicts of Interest</h2>
        <p>
          To ensure impartial reporting, all TEKZARO reporters and editors abide by clear conflict-of-interest guidelines:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Financial Interests:</strong> Journalists must disclose any financial holdings, cryptocurrency tokens, or equity in startups or technology companies they report on. Reporters are prohibited from trading securities in companies they actively cover.</li>
          <li><strong>Secondary Employment:</strong> Editorial staff members are barred from performing consulting, public relations, or media management work for technology companies within our coverage beat.</li>
          <li><strong>Family &amp; Personal Connections:</strong> If an editor has a close personal or familial relationship with a founder, executive, or public official central to a story, they must recuse themselves from editing that article.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">3. Review Units, Travel &amp; Hospitality</h2>
        <p>
          We maintain strict guidelines regarding manufacturer access:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Review Hardware:</strong> When technology manufacturers provide evaluation hardware (such as review phones or laptops), items are treated strictly as temporary loaners and returned after testing unless otherwise agreed under standard industry loan terms. Acceptance of hardware never guarantees a favorable review or any coverage at all.</li>
          <li><strong>Travel &amp; Events:</strong> When covering industry trade shows or product launches, TEKZARO covers travel expenses whenever possible. In instances where travel is accommodated by an organizer (common in international tech summits), we explicitly disclose this within the coverage.</li>
          <li><strong>No Gifts:</strong> Editorial staff are forbidden from accepting monetary gifts, lavish accommodations, or free personal electronics.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">4. Plagiarism &amp; Content Integrity</h2>
        <p>
          Plagiarism in any form is strictly prohibited. TEKZARO editors must independently research, write, and verify content. Where information originates from another news organization, researcher, or database, proper attribution and a direct hyperlink are mandatory.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">5. Non-Partisanship &amp; Objectivity</h2>
        <p>
          TEKZARO does not endorse political candidates, political parties, or partisan organizations. Our coverage of telecommunication policy, internet freedom, and regulatory bills is evaluated strictly on consumer impact, technological viability, economic transparency, and digital rights.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Compliance Contact</h2>
        <p>
          Questions or concerns regarding our journalistic ethics and ownership disclosure may be directed to our editorial leadership at{" "}
          <a href="mailto:editorial@tekzaro.co" className="text-accent hover:underline">editorial@tekzaro.co</a>.
        </p>
      </div>
    </div>
  );
}
