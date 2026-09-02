const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "2 minutes ago" / "18 minutes ago" / "1 hour ago" / "Yesterday" style —
 * falls back to a plain date beyond a week, since "12 days ago" stops being
 * a useful at-a-glance signal. No library: this is the only place in the
 * codebase that needs relative time, and date-fns/dayjs would be a lot of
 * dependency for one function. */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return date.toLocaleDateString();

  if (diffMs < MINUTE) return "Just now";
  if (diffMs < HOUR) {
    const minutes = Math.floor(diffMs / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diffMs < DAY) {
    const hours = Math.floor(diffMs / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diffMs < 2 * DAY) return "Yesterday";
  if (diffMs < 7 * DAY) {
    const days = Math.floor(diffMs / DAY);
    return `${days} days ago`;
  }
  return date.toLocaleDateString();
}
