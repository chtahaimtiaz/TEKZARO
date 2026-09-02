import type { NewsletterSubscriberStatus, Prisma } from "@prisma/client";

export const NEWSLETTER_SUBSCRIBER_STATUSES: NewsletterSubscriberStatus[] = ["CONFIRMED", "PENDING", "UNSUBSCRIBED"];

export interface SubscriberFilterParams {
  q?: string | null;
  status?: string | null;
}

/** Shared by the subscriber list page and the CSV export route so
 * "export what I'm looking at" always matches what the list actually
 * shows — an unrecognized status value is silently ignored (no filter),
 * matching how an unrecognized q is just used as-is. */
export function buildSubscriberWhere(params: SubscriberFilterParams): Prisma.NewsletterSubscriberWhereInput {
  const where: Prisma.NewsletterSubscriberWhereInput = {};
  if (params.q) where.email = { contains: params.q, mode: "insensitive" };
  if (params.status && NEWSLETTER_SUBSCRIBER_STATUSES.includes(params.status as NewsletterSubscriberStatus)) {
    where.status = params.status as NewsletterSubscriberStatus;
  }
  return where;
}
