import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { CAN_SEND_NEWSLETTER } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import type { NewsletterSubscriberStatus, Prisma } from "@prisma/client";

const STATUSES: NewsletterSubscriberStatus[] = ["CONFIRMED", "PENDING", "UNSUBSCRIBED"];

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Respects the same q/status filters as the subscriber list page, so
 * "export what I'm looking at" and "export everyone" are both one click
 * away rather than only ever offering the full table. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !CAN_SEND_NEWSLETTER.includes(user.role)) {
    return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const status = searchParams.get("status");

  const where: Prisma.NewsletterSubscriberWhereInput = {};
  if (q) where.email = { contains: q, mode: "insensitive" };
  if (status && STATUSES.includes(status as NewsletterSubscriberStatus)) {
    where.status = status as NewsletterSubscriberStatus;
  }

  const subscribers = await prisma.newsletterSubscriber.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { email: true, status: true, createdAt: true },
  });

  const rows = [
    "email,status,subscribed_at",
    ...subscribers.map((s) => [csvEscape(s.email), s.status, s.createdAt.toISOString()].join(",")),
  ];

  await logAction({
    userId: user.id,
    action: "newsletter_subscribers_exported",
    entityType: "NewsletterSubscriber",
    metadata: { count: subscribers.length, filters: { q: q ?? null, status: status ?? null } },
  });

  const filename = `tekzaro-newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
