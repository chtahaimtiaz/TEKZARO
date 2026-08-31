import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advertise",
  description: "Advertising and sponsored content opportunities on TEKZARO.",
};

export default function AdvertisePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="eyebrow">Advertise</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Advertise on TEKZARO</h1>

      <div className="prose-article mt-8 space-y-5 text-ink-soft">
        <p>
          TEKZARO reaches readers who care about Pakistani and global technology — AI, smartphones,
          computing, cybersecurity, startups and more. We offer display placements and clearly
          labeled sponsored content.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Our sponsorship standards</h2>
        <p>
          Sponsored content is always labeled &ldquo;Sponsored&rdquo; and is never presented as
          independent TEKZARO journalism. Our editorial team does not accept payment in exchange
          for coverage, and advertisers do not get editorial input on unrelated news reporting.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Get in touch</h2>
        <p>
          For rates, placements and sponsored content inquiries, email{" "}
          <a href="mailto:advertise@tekzaro.example" className="text-accent hover:underline">
            advertise@tekzaro.example
          </a>
          .
        </p>
      </div>
    </div>
  );
}
