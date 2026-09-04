import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How TEKZARO collects, uses and protects information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated: 2026-08-31</p>

      <div className="prose-article mt-8 space-y-5 text-ink-soft">
        <h2 className="text-xl font-bold text-ink">What we collect today</h2>
        <p>
          If you subscribe to the TEKZARO newsletter, we store the email address you provide in
          our database so we can send you newsletter issues once our email provider is connected.
          We do not sell or share this address with third parties.
        </p>
        <p>
          When you read an article, we increment a simple view counter on that article so our
          Trending sections reflect genuine reader interest. This counter is not tied to your
          identity, IP address, or any personal profile.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">What we don&apos;t collect yet</h2>
        <p>
          TEKZARO does not currently run third-party analytics, advertising trackers, or social
          media pixels — the architecture supports connecting an analytics provider, but no
          provider is configured. This policy will be updated with specifics (provider name, data
          collected, retention) before any such integration goes live.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Cookies</h2>
        <p>
          See our <a href="/cookie-policy" className="text-accent hover:underline">Cookie Policy</a> for
          details on what TEKZARO currently sets in your browser.
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Your rights</h2>
        <p>
          You can unsubscribe from the newsletter at any time once campaigns are live, and you can
          request deletion of your stored email address by contacting{" "}
          <a href="mailto:business@tekzaro.co" className="text-accent hover:underline">
            business@tekzaro.co
          </a>
          .
        </p>

        <h2 className="pt-2 text-xl font-bold text-ink">Changes to this policy</h2>
        <p>
          As TEKZARO connects real analytics, advertising or email-delivery providers, this page
          will be updated to reflect exactly what data those providers collect and why.
        </p>
      </div>
    </div>
  );
}
