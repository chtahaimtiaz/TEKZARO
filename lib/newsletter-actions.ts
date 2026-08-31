"use server";

import { z } from "zod";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_SEND_NEWSLETTER } from "./permissions";
import { logAction } from "./audit";
import { sendEmail } from "./email/provider";
import { siteUrl } from "./constants";

export async function unsubscribeAction(token: string): Promise<{ ok: boolean }> {
  if (!token) return { ok: false };
  const result = await prisma.newsletterSubscriber.updateMany({
    where: { unsubscribeToken: token, active: true },
    data: { active: false },
  });
  return { ok: result.count === 1 };
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

  const subscribers = await prisma.newsletterSubscriber.findMany({ where: { active: true } });

  let sent = 0;
  let failed = 0;
  for (const subscriber of subscribers) {
    const unsubscribeUrl = `${siteUrl()}/newsletter/unsubscribe?token=${subscriber.unsubscribeToken}`;
    const result = await sendEmail({
      to: subscriber.email,
      subject: campaign.subject,
      html: `${campaign.bodyHtml}<p style="color:#888;font-size:12px;margin-top:24px;">You're receiving this because you subscribed to TEKZARO. <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>`,
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
