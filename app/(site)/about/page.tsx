import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getAllAuthors } from "@/lib/articles";

export const metadata: Metadata = {
  title: "About",
  description: "About TEKZARO — Pakistan-first technology journalism with comprehensive global coverage.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const authors = await getAllAuthors();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">About the Publication</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">About TEKZARO</h1>
      <p className="mt-3 text-lg text-ink-soft">
        Independent, fact-checked technology journalism — Pakistan-first, globally informed.
      </p>

      <div className="prose-article mt-8 space-y-6 text-ink-soft">
        <p>
          Founded in 2026 by founder and owner <strong>Taha Imtiaz</strong>, <strong>TEKZARO</strong> (<a href="https://tekzaro.co" className="text-accent hover:underline">https://tekzaro.co</a>) was created around a fundamental conviction: South Asia deserves technology journalism that treats the region&apos;s digital revolution as the primary headline, rather than an afterthought to Western tech news.
        </p>
        <p>
          We report on artificial intelligence breakthroughs, smartphones, semiconductors, personal computing, cybersecurity disclosures, consumer gadgets, startup financing, and telecommunications policy. Every story is vetted by experienced human journalists and held to rigorous evidentiary standards before publication.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Our Editorial Pillars</h2>
        
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="font-bold text-ink">1. Pakistan First</h3>
            <p className="mt-1 text-sm text-ink-soft">
              We provide frontline coverage of Pakistan&apos;s burgeoning software export sector, National IT policies, digital banking rollouts, PTA telecom directives, startup funding rounds, and local hardware adoption.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="font-bold text-ink">2. Globally Contextualized</h3>
            <p className="mt-1 text-sm text-ink-soft">
              When covering worldwide technology shifts — from frontier LLM agent releases to global semiconductor fab expansions — we explicitly analyze what these changes mean for regional engineers, students, freelancers, and businesses.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="font-bold text-ink">3. Human-Vetted Rigor</h3>
            <p className="mt-1 text-sm text-ink-soft">
              We do not publish unverified aggregations or un-reviewed automated text. Every claim, benchmark, quote, and statistic is cross-referenced with primary sources and validated by our senior editorial staff.
            </p>
          </div>
        </div>

        <h2 className="pt-4 text-2xl font-bold text-ink">Editorial Masthead &amp; Staff</h2>
        <p>
          Our newsroom brings together specialized reporters covering hardware, software, security, and enterprise infrastructure:
        </p>

        {/* Founder profile — Taha Imtiaz */}
        <div className="rounded-xl border border-border bg-paper-raised p-5 mb-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-xl font-bold text-white dark:text-paper">
              TI
            </div>
            <div>
              <p className="font-bold text-ink text-lg">Taha Imtiaz</p>
              <p className="text-sm text-accent font-medium">Founder &amp; Owner, TEKZARO</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Taha Imtiaz is the founder and owner of TEKZARO, established with a focus on independent, fact-checked technology journalism for Pakistan and the wider global technology ecosystem. As founder and owner, he oversees the publication&apos;s editorial direction, ownership, and journalistic strategy.
          </p>
          <a href="/author/taha-imtiaz" className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
            View profile →
          </a>
        </div>

        <div className="not-prose mt-4 grid gap-4 sm:grid-cols-2">
          {authors.map((author) => (
            <Link
              key={author.id}
              href={`/author/${author.slug}`}
              className="flex items-center gap-3.5 rounded-xl border border-border bg-paper-raised p-3.5 hover:border-accent"
            >
              {author.photoUrl ? (
                <Image
                  src={author.photoUrl}
                  alt={author.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-sm font-bold text-white dark:text-paper">
                  {author.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-ink">{author.name}</p>
                {author.position && <p className="text-xs text-accent line-clamp-1">{author.position}</p>}
              </div>
            </Link>
          ))}
        </div>

        <h2 className="pt-4 text-2xl font-bold text-ink">Standards, Policies &amp; Ethics</h2>
        <p>
          We operate under transparent, publicly stated editorial guidelines:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <Link href="/editorial-policy" className="font-semibold text-accent hover:underline">Editorial Policy</Link> — Our standards for sourcing, independence, and technical reporting.
          </li>
          <li>
            <Link href="/fact-checking-policy" className="font-semibold text-accent hover:underline">Fact-Checking Policy</Link> — How we cross-check claims against regulatory filings and primary data.
          </li>
          <li>
            <Link href="/corrections-policy" className="font-semibold text-accent hover:underline">Corrections Policy</Link> — Our transparent process for handling and logging errors.
          </li>
          <li>
            <Link href="/ethics-policy" className="font-semibold text-accent hover:underline">Ethics &amp; Ownership Policy</Link> — Information on TEKZARO Media, funding transparency, and conflict of interest rules.
          </li>
          <li>
            <Link href="/privacy" className="font-semibold text-accent hover:underline">Privacy Policy</Link> and{" "}
            <Link href="/cookie-policy" className="font-semibold text-accent hover:underline">Cookie Policy</Link> — How we handle data, cookies, and digital advertising compliance.
          </li>
        </ul>

        <h2 className="pt-4 text-2xl font-bold text-ink">Independence &amp; Funding</h2>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-soft">
            TEKZARO is an independently operated technology publication founded and owned by Taha Imtiaz. It is not owned by any conglomerate, political group, or external investor. Revenues come from display advertising and commercial partnerships. Advertisers do not influence editorial decisions — see our{" "}
            <Link href="/ethics-policy" className="text-accent hover:underline font-semibold">Ethics &amp; Ownership Policy</Link>{" "}
            for full details.
          </p>
        </div>

        <h2 className="pt-4 text-2xl font-bold text-ink">Newsroom Contact &amp; Location</h2>
        <p>
          TEKZARO Media operations are based in Pakistan with correspondent desks across major technology hubs.
        </p>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="font-bold text-ink">TEKZARO Newsroom</p>
          <p className="mt-1 text-sm text-ink-soft">Islamabad, Pakistan</p>
          <p className="mt-2 text-sm text-ink-soft">
            Editorial Inquiries &amp; Tips:{" "}
            <a href="mailto:editorial@tekzaro.co" className="font-semibold text-accent hover:underline">editorial@tekzaro.co</a>
          </p>
          <p className="text-sm text-ink-soft">
            Commercial &amp; Partnerships:{" "}
            <a href="mailto:business@tekzaro.co" className="font-semibold text-accent hover:underline">business@tekzaro.co</a>
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            Visit our <Link href="/contact" className="text-accent hover:underline">Contact Page</Link> for desk-specific routing and secure tips.
          </p>
        </div>
      </div>
    </div>
  );
}
