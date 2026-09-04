import { EDITORIAL_TIMEZONE } from "./constants";

/**
 * Every visible date on TEKZARO is rendered in the editorial timezone.
 *
 * These formatters previously called Intl.DateTimeFormat with no timeZone
 * option, which means "use whatever zone the runtime is in". Locally that
 * is Pakistan and looked right; on Vercel the runtime is UTC, so an article
 * published at 16:30 PKT rendered as "11:30 AM" — five hours early, on
 * every public page.
 *
 * The stored instants were never wrong and are not adjusted here. Prisma
 * DateTime maps to timestamptz and every write uses new Date(), so the
 * database holds correct absolute instants; only their presentation was
 * broken. Nothing in this file shifts a timestamp — it selects the zone the
 * same instant is displayed in, which is what Intl's timeZone option is
 * for. There is deliberately no arithmetic on hours anywhere.
 *
 * timeZone is a parameter so a server component holding the configured
 * EditorialSettings value can pass it; it defaults to the same constant
 * that setting itself defaults to.
 */
export function formatDate(date: Date | null | undefined, timeZone: string = EDITORIAL_TIMEZONE): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date | null | undefined, timeZone: string = EDITORIAL_TIMEZONE): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * Elapsed time between two absolute instants. Correct in any runtime zone
 * without conversion — the arithmetic is on epoch milliseconds, which carry
 * no zone — so only the calendar-date fallback past a week needs one.
 */
export function timeAgo(date: Date | null | undefined, timeZone: string = EDITORIAL_TIMEZONE): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(date, timeZone);
}
