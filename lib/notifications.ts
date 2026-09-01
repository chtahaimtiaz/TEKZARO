import "server-only";
import { prisma } from "./prisma";
import { isEmailConfigured, sendEmail } from "./email/provider";
import { wrapEmailHtml } from "./email/template";
import { siteUrl } from "./constants";

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  /** Set true only for the small set of high-value events worth an email
   * (submitted-for-review, changes-requested, approved, published) — most
   * notifications are in-app only. No-op when SMTP isn't configured. */
  email?: boolean;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inserts an in-app Notification row, and optionally emails it too — wired
 * into the article workflow's existing transition call sites (see
 * lib/article-actions.ts) as small additive calls, not a rewrite of the
 * workflow engine. Never throws: a notification failure must never block
 * the editorial action that triggered it. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId: input.userId, type: input.type, title: input.title, body: input.body, link: input.link },
    });
  } catch {
    return;
  }

  if (!input.email || !isEmailConfigured()) return;

  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
  if (!user) return;

  const linkUrl = input.link ? `${siteUrl()}${input.link}` : null;
  await sendEmail({
    to: user.email,
    subject: input.title,
    html: wrapEmailHtml(`<p>${escapeHtml(input.body)}</p>${linkUrl ? `<p><a href="${linkUrl}">View in TEKZARO</a></p>` : ""}`),
    text: `${input.body}${linkUrl ? `\n\n${linkUrl}` : ""}`,
    relatedType: "Notification",
  });
}
