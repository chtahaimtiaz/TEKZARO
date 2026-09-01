"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { isEmailConfigured, sendEmail } from "./email/provider";
import { wrapEmailHtml } from "./email/template";
import { checkRateLimit, getClientIp } from "./rate-limit";
import { siteUrl } from "./constants";
import { createConfirmationToken } from "./newsletter-confirmation";

const emailSchema = z.string().trim().email();

async function sendConfirmationEmail(subscriberId: string, email: string): Promise<void> {
  if (!isEmailConfigured()) return;
  const { rawToken } = await createConfirmationToken(subscriberId);
  const confirmUrl = `${siteUrl()}/newsletter/confirm?token=${rawToken}`;
  await sendEmail({
    to: email,
    subject: "Confirm your TEKZARO newsletter subscription",
    html: wrapEmailHtml(
      `<p>Confirm your subscription to TEKZARO — Pakistan-first technology journalism.</p><p><a href="${confirmUrl}">Confirm subscription</a> (link expires in 48 hours).</p><p style="color:#888;font-size:12px;">Didn't request this? Ignore this email — you won't be subscribed unless you click the link.</p>`,
    ),
    text: `Confirm your subscription to TEKZARO.\n\nConfirm: ${confirmUrl}\n\n(Link expires in 48 hours. Didn't request this? Ignore this email.)`,
    relatedType: "NewsletterSubscriber",
    relatedId: subscriberId,
  });
}

/**
 * Real newsletter signup with double opt-in — inserts/updates
 * NewsletterSubscriber as PENDING and emails a confirmation link (if SMTP
 * is configured); only clicking that link (see newsletterConfirmationAction
 * in lib/newsletter-actions.ts) flips a subscriber to CONFIRMED, the only
 * status eligible for campaign sends. The welcome email fires on
 * confirmation, not here — signing up alone was never actually consent to
 * receive mail under single opt-in, which is exactly what this replaces.
 *
 * Every branch below redirects to the same generic "check your email"
 * status, regardless of whether the address was new, already pending, or
 * already confirmed — so the public form can't be used to enumerate which
 * addresses are subscribed.
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

  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: parsed.data } });

  if (!existing) {
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { email: parsed.data, status: "PENDING", unsubscribeToken: randomUUID() },
    });
    await sendConfirmationEmail(subscriber.id, subscriber.email);
  } else if (existing.status === "CONFIRMED") {
    // Already subscribed — no confirmation email storm, at most a quiet
    // notice, and the same generic redirect either way (no enumeration).
    if (isEmailConfigured()) {
      await sendEmail({
        to: existing.email,
        subject: "You're already subscribed to TEKZARO",
        html: wrapEmailHtml(`<p>This address is already subscribed to the TEKZARO newsletter — no action needed.</p>`),
        text: "This address is already subscribed to the TEKZARO newsletter — no action needed.",
        relatedType: "NewsletterSubscriber",
        relatedId: existing.id,
      });
    }
  } else {
    // PENDING (resend) or UNSUBSCRIBED (re-subscribing) both land back in
    // PENDING with a fresh token — never auto-reactivate straight to
    // CONFIRMED, and never create a duplicate subscriber row.
    await prisma.newsletterSubscriber.update({ where: { id: existing.id }, data: { status: "PENDING" } });
    await sendConfirmationEmail(existing.id, existing.email);
  }

  redirect(`${redirectTo}?newsletter=pending`);
}
