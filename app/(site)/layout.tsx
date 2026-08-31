import { SiteHeader } from "@/components/layout/SiteHeader";
import { BreakingTicker } from "@/components/layout/BreakingTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";

// Every public page renders the live breaking-news ticker (real DB read), so
// the whole site tree is dynamic rather than attempting build-time SSG for
// the handful of pages that otherwise have no DB calls of their own.
export const dynamic = "force-dynamic";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <BreakingTicker />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
