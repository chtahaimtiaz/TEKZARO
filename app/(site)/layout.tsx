import { SiteHeader } from "@/components/layout/SiteHeader";
import { BreakingTicker } from "@/components/layout/BreakingTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";

// Every public page renders the live breaking-news ticker (real DB read), so
// the whole site tree is dynamic rather than attempting build-time SSG for
// the handful of pages that otherwise have no DB calls of their own.
export const dynamic = "force-dynamic";

// Secondary to the self-hosted PageView table (see /admin/analytics) — this
// is an optional, honestly-gated hook for a third-party analytics tag.
// Unset (the default): nothing renders, no external request is made. Set:
// renders a Plausible-style script tag (data-domain + a single script src) —
// the most common privacy-respecting, zero-config option; adjust the tag
// shape here if a different provider is actually chosen.
const analyticsId = process.env.NEXT_PUBLIC_ANALYTICS_ID;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {analyticsId && <script defer data-domain={analyticsId} src="https://plausible.io/js/script.js" />}
      <SiteHeader />
      <BreakingTicker />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
