import { SiteHeader } from "@/components/layout/SiteHeader";
import { BreakingTicker } from "@/components/layout/BreakingTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";

// BreakingTicker is now cached via unstable_cache (60 s revalidation), so
// the layout no longer needs force-dynamic. Individual pages set their own
// revalidate period. Admin pages remain dynamic because they read session
// cookies — that dynamic constraint is set in app/admin, not here.

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
