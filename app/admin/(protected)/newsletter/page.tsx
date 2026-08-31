import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAN_SEND_NEWSLETTER } from "@/lib/permissions";
import { isEmailConfigured } from "@/lib/email/provider";
import { createCampaignAction, sendCampaignAction } from "@/lib/newsletter-actions";

export const dynamic = "force-dynamic";

export default async function NewsletterAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_SEND_NEWSLETTER.includes(user.role)) redirect("/admin");
  const { error } = await searchParams;

  const [campaigns, subscriberCount] = await Promise.all([
    prisma.newsletterCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.newsletterSubscriber.count({ where: { active: true } }),
  ]);

  const emailConfigured = isEmailConfigured();

  async function handleCreate(formData: FormData) {
    "use server";
    const result = await createCampaignAction(formData);
    if (!result.ok) redirect(`/admin/newsletter?error=${encodeURIComponent(result.error ?? "Failed to create campaign.")}`);
    redirect("/admin/newsletter");
  }

  async function handleSend(campaignId: string) {
    "use server";
    const result = await sendCampaignAction(campaignId);
    if (!result.ok) redirect(`/admin/newsletter?error=${encodeURIComponent(result.error ?? "Failed to send campaign.")}`);
    redirect("/admin/newsletter");
  }

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Newsletter</h1>
      <p className="mt-1 text-sm text-ink-muted">{subscriberCount} active subscriber(s).</p>

      {!emailConfigured && (
        <p className="mt-4 rounded-md border border-dashed border-border-strong bg-paper-raised p-3 text-sm text-ink-muted">
          SMTP isn&apos;t configured — campaigns can be drafted but not sent until SMTP_HOST/PORT/USER/PASS are set.
        </p>
      )}
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-5">
        <h2 className="text-lg font-bold">New campaign</h2>
        <form action={handleCreate} className="mt-3 flex flex-col gap-3">
          <input name="subject" placeholder="Subject" required className="rounded-md border border-border-strong p-2 text-sm" />
          <textarea
            name="bodyHtml"
            placeholder="HTML body"
            required
            rows={8}
            className="rounded-md border border-border-strong p-2 font-mono text-xs"
          />
          <p className="text-xs text-ink-muted">
            An unsubscribe link is appended automatically to every send — don&apos;t include your own.
          </p>
          <button type="submit" className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark">
            Save draft
          </button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Campaigns</h2>
        <div className="mt-3 flex flex-col gap-3">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-paper-raised p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold">{c.subject}</p>
                <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold uppercase text-ink-muted">{c.status}</span>
              </div>
              <div className="prose-article mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-paper p-3 text-sm" dangerouslySetInnerHTML={{ __html: c.bodyHtml }} />
              <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                <span>
                  {c.status === "SENT" && c.sentAt
                    ? `Sent ${c.sentAt.toLocaleString()} to ${c.recipientCount ?? 0} recipient(s)`
                    : `Created ${c.createdAt.toLocaleString()}`}
                </span>
                {c.status === "DRAFT" && (
                  <form action={handleSend.bind(null, c.id)}>
                    <button
                      type="submit"
                      disabled={!emailConfigured || subscriberCount === 0}
                      className="rounded-md bg-accent px-3 py-1.5 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send now
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
          {campaigns.length === 0 && <p className="text-sm text-ink-muted">No campaigns yet.</p>}
        </div>
      </section>
    </div>
  );
}
