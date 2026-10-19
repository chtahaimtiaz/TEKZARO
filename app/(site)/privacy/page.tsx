import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "TEKZARO's Privacy Policy — how we handle data, cookies, and advertising transparency.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Legal &amp; Compliance</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated: October 2026</p>

      <div className="prose-article mt-8 space-y-6 text-ink-soft">
        <p>
          At TEKZARO (<a href="https://tekzaro.co" className="text-accent hover:underline">https://tekzaro.co</a>), accessible from https://tekzaro.co, one of our main priorities is the privacy of our visitors. This Privacy Policy document outlines the types of information that is collected and recorded by TEKZARO and how we use it.
        </p>
        <p>
          If you have additional questions or require more information about our Privacy Policy, please do not hesitate to contact our editorial and compliance team at{" "}
          <a href="mailto:editorial@tekzaro.co" className="text-accent hover:underline">editorial@tekzaro.co</a>.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Log Files &amp; Reading Analytics</h2>
        <p>
          TEKZARO follows a standard procedure of using log files. These files log visitors when they visit websites. The information collected by log files includes internet protocol (IP) addresses, browser type, Internet Service Provider (ISP), date and time stamp, referring/exit pages, and possibly the number of clicks. These are not linked to any information that is personally identifiable. The purpose of the information is for analyzing trends, administering the site, tracking users&apos; movement on the website, and gathering demographic information to ensure site reliability.
        </p>
        <p>
          When you read an article on TEKZARO, we increment a view counter on that story so our Trending metrics reflect genuine reader interest. This counter is anonymous and not tied to individual profiles.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Newsletter &amp; Direct Communications</h2>
        <p>
          If you voluntarily subscribe to the TEKZARO newsletter, we collect and store your email address solely to deliver technology news roundups and editorial dispatches. We do not sell, rent, or trade subscriber email lists to any third parties. You can unsubscribe at any time using the one-click unsubscribe link at the bottom of any newsletter email or by reaching out to us directly.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Cookies and Web Beacons</h2>
        <p>
          Like any other website, TEKZARO uses &ldquo;cookies&rdquo;. These cookies are used to store information including visitors&apos; preferences, and the pages on the website that the visitor accessed or visited. The information is used to optimize the users&apos; experience by customizing our web page content based on visitors&apos; browser type and/or other information.
        </p>
        <p>
          For more details on how cookies are deployed and managed, please review our comprehensive{" "}
          <Link href="/cookie-policy" className="text-accent hover:underline">Cookie Policy</Link>.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Google DoubleClick DART Cookie &amp; Third-Party Advertising</h2>
        <p>
          Google is one of the third-party vendors on our site. It also uses cookies, known as DART cookies, to serve ads to our site visitors based upon their visit to www.tekzaro.co and other sites on the internet.
        </p>
        <p>
          Third-party ad servers or ad networks use technologies like cookies, JavaScript, or Web Beacons that are used in their respective advertisements and links that appear on TEKZARO, which are sent directly to users&apos; browser. They automatically receive your IP address when this occurs. These technologies are used to measure the effectiveness of their advertising campaigns and/or to personalize the advertising content that you see on websites that you visit.
        </p>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="font-semibold text-ink">Opting Out of Personalized Advertising:</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
            <li>
              Visitors may choose to decline the use of DART cookies by visiting the Google ad and content network Privacy Policy at{" "}
              <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                https://policies.google.com/technologies/ads
              </a>.
            </li>
            <li>
              You can manage your Google Ad Personalization preferences at{" "}
              <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                Google Ads Settings
              </a>.
            </li>
            <li>
              You can also opt out of participating third-party ad networks via the Digital Advertising Alliance at{" "}
              <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                aboutads.info
              </a>{" "}
              or the Network Advertising Initiative at{" "}
              <a href="https://optout.networkadvertising.org/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                networkadvertising.org
              </a>.
            </li>
          </ul>
        </div>
        <p className="text-sm">
          Note that TEKZARO has no access to or control over these cookies that are used by third-party advertisers.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Third-Party Privacy Policies</h2>
        <p>
          TEKZARO&apos;s Privacy Policy does not apply to other advertisers or websites. Thus, we are advising you to consult the respective Privacy Policies of these third-party ad servers for more detailed information. It may include their practices and instructions about how to opt-out of certain options.
        </p>
        <p>
          You can choose to disable cookies through your individual browser options. To know more detailed information about cookie management with specific web browsers, it can be found at the browsers&apos; respective websites.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">CCPA &amp; GDPR Data Protection Rights</h2>
        <p>
          We want to make sure you are fully aware of all of your data protection rights. Every user is entitled to the following:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>The right to access</strong> — You have the right to request copies of your personal data.</li>
          <li><strong>The right to rectification</strong> — You have the right to request that we correct any information you believe is inaccurate or complete information you believe is incomplete.</li>
          <li><strong>The right to erasure</strong> — You have the right to request that we erase your personal data, under certain conditions.</li>
          <li><strong>The right to restrict processing</strong> — You have the right to request that we restrict the processing of your personal data, under certain conditions.</li>
          <li><strong>The right to object to processing</strong> — You have the right to object to our processing of your personal data, under certain conditions.</li>
          <li><strong>The right to data portability</strong> — You have the right to request that we transfer the data that we have collected to another organization, or directly to you, under certain conditions.</li>
        </ul>

        <h2 className="pt-2 text-2xl font-bold text-ink">Children&apos;s Information</h2>
        <p>
          Another part of our priority is adding protection for children while using the internet. We encourage parents and guardians to observe, participate in, and/or monitor and guide their online activity.
        </p>
        <p>
          TEKZARO does not knowingly collect any Personal Identifiable Information from children under the age of 13. If you think that your child provided this kind of information on our website, we strongly encourage you to contact us immediately and we will do our best efforts to promptly remove such information from our records.
        </p>

        <h2 className="pt-2 text-2xl font-bold text-ink">Consent &amp; Updates</h2>
        <p>
          By using our website, you hereby consent to our Privacy Policy and agree to its terms. If we update, amend, or make any changes to our privacy policy, those changes will be posted prominently on this page with a revised timestamp.
        </p>
      </div>
    </div>
  );
}
