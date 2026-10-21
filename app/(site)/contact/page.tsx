import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact the TEKZARO newsroom — news tips, security disclosures, corrections, advertising and general inquiries.",
  alternates: { canonical: "/contact" },
};

const CONTACTS = [
  {
    label: "News Tips & Leaks",
    email: "editorial@tekzaro.co",
    description: "Have a Pakistani or global technology story, startup launch, or insider tip? Share it with our reporters.",
  },
  {
    label: "Corrections & Verification",
    email: "editorial@tekzaro.co",
    description: "Spotted a factual inaccuracy or broken citation? We investigate all reports promptly under our Corrections Policy.",
    linkHref: "/corrections-policy",
    linkText: "Read our Corrections Policy →",
  },
  {
    label: "Security Disclosures",
    email: "editorial@tekzaro.co",
    description: "For security researchers and ethical hackers reporting vulnerabilities or threat intelligence.",
  },
  {
    label: "Press Releases & Embargoes",
    email: "editorial@tekzaro.co",
    description: "Product launch releases, hardware review unit offers, executive interview requests, and media advisories.",
  },
  {
    label: "Advertising & Sponsorships",
    email: "business@tekzaro.co",
    description: "Custom sponsorship packages, newsletter features, and display advertising partnerships.",
    linkHref: "/advertise",
    linkText: "View Advertising Options →",
  },
  {
    label: "Syndication & Licensing",
    email: "business@tekzaro.co",
    description: "Requests to syndicate TEKZARO reporting, republish excerpts, or license technical benchmark data.",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Newsroom Inquiries</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Contact TEKZARO</h1>
      <p className="mt-3 text-ink-soft">
        We read every message sent to our desks. Reach out directly below to connect with the right team.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CONTACTS.map((c) => (
          <div key={c.label} className="flex flex-col justify-between rounded-xl border border-border bg-paper-raised p-5">
            <div>
              <p className="font-bold text-ink">{c.label}</p>
              <p className="mt-1 text-sm text-ink-soft">{c.description}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/60">
              <a href={`mailto:${c.email}`} className="text-sm font-semibold text-accent hover:underline">
                {c.email}
              </a>
              {c.linkHref && (
                <div className="mt-1.5">
                  <Link href={c.linkHref} className="text-xs text-ink-muted hover:text-accent hover:underline">
                    {c.linkText}
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-border bg-paper-raised p-6">
        <h2 className="text-lg font-bold text-ink">Newsroom Address &amp; Response Times</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 text-sm text-ink-soft">
          <div>
            <p className="font-semibold text-ink">Headquarters &amp; Bureaus</p>
            <p className="mt-1">TEKZARO Media</p>
            <p>Islamabad, Pakistan</p>
            <p className="mt-1 text-xs text-ink-muted">Independent South Asian Technology Newsroom</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Turnaround &amp; Review Policy</p>
            <p className="mt-1">Standard response time: 24–48 business hours.</p>
            <p>Urgent breaking news tips and corrections receive expedited review by on-duty editors.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
