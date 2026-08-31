"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";

const emailSchema = z.string().trim().email();

/**
 * Real newsletter signup — inserts into NewsletterSubscriber. No email
 * provider is configured yet (see .env EMAIL_PROVIDER_API_KEY), so this only
 * captures the subscriber; sending campaigns is Phase 3+ once a provider is
 * wired up. Never fakes a "sent" confirmation.
 */
export async function subscribeToNewsletter(redirectTo: string, formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    redirect(`${redirectTo}?newsletter=invalid`);
  }

  try {
    await prisma.newsletterSubscriber.create({ data: { email: parsed.data } });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2002") throw err; // P2002 = unique constraint (already subscribed)
    redirect(`${redirectTo}?newsletter=exists`);
  }

  redirect(`${redirectTo}?newsletter=success`);
}
