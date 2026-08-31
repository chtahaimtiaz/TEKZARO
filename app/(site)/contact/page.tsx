import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact the TEKZARO newsroom — tips, corrections, advertising and general inquiries.",
};

const CONTACTS = [
  {
    label: "News tips & story ideas",
    email: "tips@tekzaro.example",
    description: "Have a Pakistani or global technology story we should be covering? Tell us about it.",
  },
  {
    label: "Corrections",
    email: "corrections@tekzaro.example",
    description: "Spotted an error in a published article? Let us know what to fix.",
  },
  {
    label: "Advertising & partnerships",
    email: "advertise@tekzaro.example",
    description: "Inquiries about sponsored content or advertising placements.",
  },
  {
    label: "General",
    email: "hello@tekzaro.example",
    description: "Anything else — feedback, partnerships, or press inquiries.",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="eyebrow">Contact</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Get in Touch</h1>
      <p className="mt-3 text-ink-soft">
        A routed contact form will be added once TEKZARO&apos;s email provider is configured. Until
        then, reach the right desk directly below.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CONTACTS.map((c) => (
          <div key={c.email} className="rounded-xl border border-border bg-paper-raised p-5">
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
