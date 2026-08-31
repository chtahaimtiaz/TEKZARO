import type { Metadata } from "next";
import { unsubscribeAction } from "@/lib/newsletter-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await unsubscribeAction(token) : { ok: false };

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="eyebrow">Newsletter</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">
        {result.ok ? "You're unsubscribed" : "Couldn't unsubscribe"}
      </h1>
      <p className="mt-3 text-ink-soft">
        {result.ok
          ? "You won't receive the TEKZARO newsletter anymore. You can re-subscribe any time from the newsletter page."
          : "This unsubscribe link is invalid or has already been used."}
      </p>
    </div>
  );
}
