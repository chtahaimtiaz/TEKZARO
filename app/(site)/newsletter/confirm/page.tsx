import type { Metadata } from "next";
import { confirmSubscriptionAction } from "@/lib/newsletter-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm subscription",
  robots: { index: false, follow: false },
};

export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await confirmSubscriptionAction(token) : { ok: false as const, status: null };

  const heading =
    result.status === "CONFIRMED"
      ? "Subscription confirmed"
      : result.status === "UNSUBSCRIBED"
        ? "This link is no longer valid"
        : "Couldn't confirm subscription";

  const message =
    result.status === "CONFIRMED"
      ? "You're all set — the TEKZARO Pakistan Tech Briefing will land in your inbox when there's something worth reading."
      : result.status === "UNSUBSCRIBED"
        ? "This address has since unsubscribed, so this older confirmation link no longer applies. Subscribe again from the newsletter page if you'd like to rejoin."
        : "This confirmation link is invalid, has expired, or has already been used. Subscribe again from the newsletter page to get a fresh link.";

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="eyebrow">Newsletter</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">{heading}</h1>
      <p className="mt-3 text-ink-soft">{message}</p>
    </div>
  );
}
