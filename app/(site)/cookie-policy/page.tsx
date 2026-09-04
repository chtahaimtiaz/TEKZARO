import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "What cookies TEKZARO currently sets in your browser.",
  alternates: { canonical: "/cookie-policy" },
};

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Cookie Policy</h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated: 2026-09-01</p>

      <div className="prose-article mt-8 space-y-5 text-ink-soft">
        <p>
          TEKZARO currently sets no advertising, tracking, or third-party analytics cookies. The
          public site does not require a cookie-consent banner today because it does not use
          non-essential cookies.
        </p>
        <p>
          Once an analytics provider is connected (see our admin settings for configuration
          status), this policy will be updated to name the provider, describe what it collects, and
          a consent mechanism will be added ahead of that change going live.
        </p>
        <p>
          The CMS/admin area (not publicly accessible) uses a strictly necessary session cookie for
          authenticated editorial staff — that cookie is required for the CMS to function and is not
          used for tracking.
        </p>
      </div>
    </div>
  );
}
