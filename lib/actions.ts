"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { isEmailConfigured, sendEmail } from "./email/provider";
import { checkRateLimit, getClientIp } from "./rate-limit";
import { siteUrl } from "./constants";

const emailSchema = z.string().trim().email();

/**
 * Real newsletter signup — inserts into NewsletterSubscriber and, if SMTP
 * is configured, sends a short welcome email (with the unsubscribe link
 * every subsequent send also carries). Sending campaigns lives in
 * /admin/newsletter (lib/newsletter-actions.ts). Never fakes a "sent"
 * confirmation when email isn't configured — it just captures the
 * subscriber, same honest behavior as before Phase 5.
 *
 * Double opt-in (confirm-before-subscribed) is deliberately NOT built here
 * — see the Phase 5 report: it's a pre-launch blocking requirement for real
 * public distribution, not a backlog nicety, and should land before this
 * flow is used to send bulk mail to a real audience.
 */
export async function subscribeToNewsletter(redirectTo: string, formData: FormData) {
  const ip = await getClientIp();
  const allowed = await checkRateLimit(`newsletter-signup:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 });
  if (!allowed) {
    redirect(`${redirectTo}?newsletter=ratelimited`);
  }

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    redirect(`${redirectTo}?newsletter=invalid`);
  }

  let subscriber;
  try {
    subscriber = await prisma.newsletterSubscriber.create({
      data: { email: parsed.data, unsubscribeToken: randomUUID() },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2002") throw err; // P2002 = unique constraint (already subscribed)
    redirect(`${redirectTo}?newsletter=exists`);
  }

  if (isEmailConfigured()) {
    const unsubscribeUrl = `${siteUrl()}/newsletter/unsubscribe?token=${subscriber.unsubscribeToken}`;
    await sendEmail({
      to: subscriber.email,
      subject: "You're subscribed to TEKZARO",
      html: `<p>Thanks for subscribing to TEKZARO — Pakistan-first technology journalism.</p><p style="color:#888;font-size:12px;">Didn't sign up? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>`,
      text: `Thanks for subscribing to TEKZARO — Pakistan-first technology journalism.\n\nDidn't sign up? Unsubscribe: ${unsubscribeUrl}`,
      relatedType: "NewsletterSubscriber",
      relatedId: subscriber.id,
    });
  }

  redirect(`${redirectTo}?newsletter=success`);
}
