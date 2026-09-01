"use server";

import { z } from "zod";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_SEND_NEWSLETTER } from "./permissions";
import { logAction } from "./audit";
import { sendEmail } from "./email/provider";
import { wrapEmailHtml } from "./email/template";
import { siteUrl } from "./constants";
import { consumeConfirmationToken } from "./newsletter-confirmation";
import { checkRateLimit, getClientIp } from "./rate-limit";

export async function unsubscribeAction(token: string): Promise<{ ok: boolean }> {
  if (!token) return { ok: false };
  const result = await prisma.newsletterSubscriber.updateMany({
    where: { unsubscribeToken: token, status: { in: ["PENDING", "CONFIRMED"] } },
    data: { status: "UNSUBSCRIBED" },
  });
  return { ok: result.count === 1 };
}

export type ConfirmSubscriptionResult =
  | { ok: true; status: "CONFIRMED" } // freshly confirmed, or was already confirmed — both genuinely subscribed
  | { ok: false; status: "UNSUBSCRIBED" } // token was real, but the subscriber unsubscribed before it was used — never resurrected
  | { ok: false; status: null }; // token missing, invalid, expired, already-used, or rate-limited

/**
 * Consumes a newsletter confirmation token and, on success, flips the
 * subscriber PENDING -> CONFIRMED. The `updateMany` is guarded on
 * `status:"PENDING"` specifically (not just "exists") so a token replayed
 * after the subscriber unsubscribed through a different link in the
 * interim can never resurrect them — the token is still burned by
 * consumeConfirmationToken's own atomic claim either way. Sends the
 * welcome email here, on confirmation, not at initial signup.
 *
 * Returns the subscriber's actual resulting status rather than a bare
 * boolean: a stale token replayed after an unsubscribe correctly leaves the
 * row UNSUBSCRIBED (verified live), but a bare `{ok:true}` in that case
 * would make the confirm page claim "Subscription confirmed" when nothing
 * was — this shape lets the page render the truth instead.
 */
export async function confirmSubscriptionAction(token: string): Promise<ConfirmSubscriptionResult> {
  if (!token) return { ok: false, status: null };

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`newsletter-confirm:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 });
  if (!allowed) return { ok: false, status: null };

  const claim = await consumeConfirmationToken(token);
  if (!claim) return { ok: false, status: null };

  const flipped = await prisma.newsletterSubscriber.updateMany({
    where: { id: claim.subscriberId, status: "PENDING" },
    data: { status: "CONFIRMED" },
  });

  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { id: claim.subscriberId } });
  if (!subscriber) return { ok: false, status: null };

  if (flipped.count === 1) {
    const unsubscribeUrl = `${siteUrl()}/newsletter/unsubscribe?token=${subscriber.unsubscribeToken}`;
    await sendEmail({
      to: subscriber.email,
      subject: "You're subscribed to TEKZARO",
      html: wrapEmailHtml(
        `<p>You're confirmed — thanks for subscribing to TEKZARO, Pakistan-first technology journalism.</p><p style="color:#888;font-size:12px;">Didn't mean to? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>`,
      ),
      text: `You're confirmed — thanks for subscribing to TEKZARO.\n\nDidn't mean to? Unsubscribe: ${unsubscribeUrl}`,
      relatedType: "NewsletterSubscriber",
      relatedId: subscriber.id,
    });
  }

  if (subscriber.status === "CONFIRMED") return { ok: true, status: "CONFIRMED" };
  if (subscriber.status === "UNSUBSCRIBED") return { ok: false, status: "UNSUBSCRIBED" };
  return { ok: false, status: null };
}

const campaignSchema = z.object({
  subject: z.string().trim().min(1),
  bodyHtml: z.string().trim().min(1),
});

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

export async function createCampaignAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_SEND_NEWSLETTER);

  const parsed = campaignSchema.safeParse({
    subject: formData.get("subject"),
    bodyHtml: formData.get("bodyHtml"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const campaign = await prisma.newsletterCampaign.create({
    data: { subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml, createdById: actor.id },
  });

  await logAction({ userId: actor.id, action: "newsletter_campaign_created", entityType: "NewsletterCampaign", entityId: campaign.id });

  return { ok: true, data: { id: campaign.id } };
}

/** Sends the campaign's real content to the acting admin's own address only
 * — never touches subscribers, campaign status, sentAt, or recipientCount.
 * Lets an editor see exactly what will be sent (subject line, rendering in
 * a real inbox, spam-folder behavior) before committing to the real send. */
export async function sendTestCampaignAction(campaignId: string): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_SEND_NEWSLETTER);

  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const result = await sendEmail({
    to: actor.email,
    subject: `[TEST] ${campaign.subject}`,
    html: wrapEmailHtml(
      `${campaign.bodyHtml}<p style="color:#888;font-size:12px;margin-top:24px;">This is a test send to yourself — the line below is a placeholder, not a real per-subscriber unsubscribe link.</p><p style="color:#888;font-size:12px;">(Unsubscribe link)</p>`,
    ),
    text: `[TEST] ${campaign.subject}\n\nThis is a test send to yourself — no real subscribers were emailed.`,
    relatedType: "NewsletterCampaign",
    relatedId: campaign.id,
  });

  if (!result.ok) {
    return { ok: false, error: "notConfigured" in result ? "SMTP isn't configured." : result.error };
  }

  await logAction({
    userId: actor.id,
    action: "newsletter_campaign_test_sent",
    entityType: "NewsletterCampaign",
    entityId: campaignId,
    metadata: { to: actor.email },
  });

  return { ok: true };
}

/**
 * MVP send path — NOT the production architecture. Loops active
 * subscribers sequentially inside one request/Server Action invocation;
 * fine for a list of a few hundred, but will hit Vercel's function-duration
 * limit for a much larger one. Future: durable email job queue + retry
 * system + provider-level bulk sending API.
 */
export async function sendCampaignAction(campaignId: string): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_SEND_NEWSLETTER);

  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, error: "Campaign not found." };
  if (campaign.status !== "DRAFT") return { ok: false, error: "This campaign has already been sent." };

  await prisma.newsletterCampaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });

  const subscribers = await prisma.newsletterSubscriber.findMany({ where: { status: "CONFIRMED" } });

  let sent = 0;
  let failed = 0;
  for (const subscriber of subscribers) {
    const unsubscribeUrl = `${siteUrl()}/newsletter/unsubscribe?token=${subscriber.unsubscribeToken}`;
    const result = await sendEmail({
      to: subscriber.email,
      subject: campaign.subject,
      html: wrapEmailHtml(
        `${campaign.bodyHtml}<p style="color:#888;font-size:12px;margin-top:24px;">You're receiving this because you subscribed to TEKZARO. <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>`,
      ),
      text: `${campaign.subject}\n\nUnsubscribe: ${unsubscribeUrl}`,
      relatedType: "NewsletterCampaign",
      relatedId: campaign.id,
    });
    if (result.ok) sent += 1;
    else failed += 1;
  }

  const finalStatus = failed === 0 || sent > 0 ? "SENT" : "FAILED";
  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: { status: finalStatus, sentAt: new Date(), recipientCount: sent },
  });

  await logAction({
    userId: actor.id,
    action: "newsletter_campaign_sent",
    entityType: "NewsletterCampaign",
    entityId: campaignId,
    metadata: { sent, failed, total: subscribers.length },
  });

  return { ok: true };
}
