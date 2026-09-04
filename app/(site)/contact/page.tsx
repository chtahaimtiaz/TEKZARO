import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact the TEKZARO newsroom — tips, corrections, advertising and general inquiries.",
  alternates: { canonical: "/contact" },
};

// Two public desks, deliberately: editorial@ for anything newsroom-facing
// and business@ for anything commercial. Corrections keeps its own card
// even though it shares the editorial inbox — a visible, obvious route for
// reporting an error is part of being a credible publication, not a
// routing detail. admin@ is never listed here; it's the private account
// owner address (billing, vendors, service notifications).
const CONTACTS = [
  {
    label: "News tips & story ideas",
    email: "editorial@tekzaro.co",
    description: "Have a Pakistani or global technology story we should be covering? Tell us about it.",
  },
  {
    label: "Corrections",
    email: "editorial@tekzaro.co",
    description: "Spotted an error in a published article? Let us know what to fix.",
  },
  {
    label: "Press & PR",
    email: "editorial@tekzaro.co",
    description: "Press releases, embargoes, and journalist inquiries.",
  },
  {
    label: "Advertising & partnerships",
    email: "business@tekzaro.co",
    description: "Sponsorships, advertising placements, and commercial inquiries.",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="eyebrow">Contact</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Get in Touch</h1>
      <p className="mt-3 text-ink-soft">
        Reach the right desk directly below — we read everything that comes in.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CONTACTS.map((c) => (
          // Keyed by label, not email — several desks share the editorial
          // inbox, so email is no longer unique across this list.
          <div key={c.label} className="rounded-xl border border-border bg-paper-raised p-5">
            <p className="font-bold">{c.label}</p>
            <p className="mt-1 text-sm text-ink-soft">{c.description}</p>
            <a href={`mailto:${c.email}`} className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
              {c.email}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
