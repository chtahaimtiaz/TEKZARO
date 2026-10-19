import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "TEKZARO's Cookie Policy — how we and third-party partners use cookies and how you can manage them.",
  alternates: { canonical: "/cookie-policy" },
};

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Legal &amp; Compliance</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Cookie Policy</h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated: October 2026</p>

      <div className="prose-article mt-8 space-y-6 text-ink-soft">
        <p>
          This Cookie Policy explains how TEKZARO (&ldquo;we&rdquo;, &ldquo;us&rdquo;, and &ldquo;our&rdquo;) uses cookies and similar technologies to recognize you when you visit our website at <a href="https://tekzaro.co" className="text-accent hover:underline">https://tekzaro.co</a>. It explains what these technologies are and why we use them, as well as your rights to control our use of them.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">What Are Cookies?</h2>
        <p>
          Cookies are small data files that are placed on your computer or mobile device when you visit a website. Cookies are widely used by website owners in order to make their websites work, or to work more efficiently, as well as to provide reporting information and personalized functionality.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Cookies Used on TEKZARO</h2>
        <p>
          We categorize the cookies used on TEKZARO into the following groups:
        </p>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="font-bold text-ink">1. Strictly Necessary &amp; Functional Cookies</h3>
            <p className="mt-1 text-sm text-ink-soft">
              These cookies are essential to provide you with services available through our website. They store non-identifying preferences such as your chosen reading theme (Dark, Light, or System) and maintain secure session states for editorial staff. These cookies do not track your browsing habits on external sites.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="font-bold text-ink">2. Analytics &amp; Performance Cookies</h3>
            <p className="mt-1 text-sm text-ink-soft">
              These cookies collect aggregated, anonymous information about how visitors interact with our pages, such as which technology articles are read most frequently. We use this data solely to optimize editorial curation, identify broken links, and improve reader navigation.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="font-bold text-ink">3. Advertising &amp; Third-Party Cookies (Google AdSense)</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Third-party vendors, including Google, use cookies to serve advertisements based on a user&apos;s prior visits to TEKZARO or other websites on the internet.
            </p>
            <p className="mt-2 text-sm text-ink-soft">
              Google&apos;s use of advertising cookies enables it and its certified partners to serve ads to our readers based on their navigation history. These cookies may track data such as your IP address, browser type, and interaction with particular ad units.
            </p>
          </div>
        </div>

        <h2 className="pt-2 text-2xl font-bold text-ink">How Can You Control or Disable Cookies?</h2>
        <p>
          You have the right to decide whether to accept or reject cookies. You can exercise your cookie rights by setting your preferences in your web browser. Most web browsers allow you to control cookies through their settings:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Google Chrome:</strong> Settings → Privacy and Security → Cookies and other site data</li>
          <li><strong>Mozilla Firefox:</strong> Settings → Privacy &amp; Security → Enhanced Tracking Protection / Cookies</li>
          <li><strong>Apple Safari:</strong> Preferences → Privacy → Block all cookies / Manage Website Data</li>
          <li><strong>Microsoft Edge:</strong> Settings → Cookies and site permissions → Manage and delete cookies</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">Opting Out of Targeted Advertising</h2>
        <p>
          In addition to browser-level controls, you can opt out of interest-based digital advertising through dedicated industry portals:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Google Ad Settings
            </a> — Manage your personal ad preferences across Google services.
          </li>
          <li>
            <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Digital Advertising Alliance (AboutAds)
            </a> — Opt-out tool for consumer choice.
          </li>
          <li>
            <a href="https://optout.networkadvertising.org/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Network Advertising Initiative (NAI)
            </a> — Multi-network opt-out page.
          </li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">Updates to This Policy</h2>
        <p>
          We may update this Cookie Policy from time to time in order to reflect changes to the cookies we use or for other operational, legal, or regulatory reasons. Please revisit this policy periodically to stay informed about our use of cookies and related technologies.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Contact Us</h2>
        <p>
          If you have any questions about our use of cookies or other technologies, please email us at{" "}
          <a href="mailto:editorial@tekzaro.co" className="text-accent hover:underline">editorial@tekzaro.co</a>.
        </p>
      </div>
    </div>
  );
}
