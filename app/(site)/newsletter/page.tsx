import type { Metadata } from "next";
import { NewsletterForm } from "@/components/ui/NewsletterForm";

export const metadata: Metadata = {
  title: "Newsletter",
  description: "Stay Ahead of Technology — the TEKZARO Pakistan Tech Briefing.",
};

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ newsletter?: string }>;
}) {
  const { newsletter } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="eyebrow">Newsletter</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Stay Ahead of Technology</h1>
      <p className="mt-3 text-ink-soft">
        The TEKZARO Pakistan Tech Briefing — the technology stories that matter most in Pakistan
        today, with regional and global developments in context. Sent when there&apos;s something
        worth your inbox.
      </p>

      <div className="mt-6 rounded-xl bg-ink p-6 sm:p-8">
        <NewsletterForm redirectTo="/newsletter" status={newsletter} />
      </div>

      <div className="prose-article mt-10 space-y-4 text-ink-soft">
        <h2 className="text-xl font-bold text-ink">What&apos;s inside each issue</h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li><strong className="text-ink">Pakistan</strong> — the day&apos;s or week&apos;s most important Pakistani technology developments.</li>
          <li><strong className="text-ink">Regional</strong> — South Asia and Gulf developments that affect Pakistan&apos;s technology sector.</li>
          <li><strong className="text-ink">Global</strong> — major world technology news, with a Pakistan angle noted where one genuinely exists.</li>
        </ol>
        <p className="text-sm text-ink-muted">
          Delivery requires an email provider to be configured (see admin settings). Subscriptions
          are captured now so no signups are lost once sending goes live.
        </p>
      </div>
    </div>
  );
}
