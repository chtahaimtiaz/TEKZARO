/**
 * Wall-clock <-> instant conversion for a named IANA zone, dependency-free.
 *
 * This project has no date library, and these are the only two directions it
 * needs. Nothing here adds or subtracts a fixed number of hours: the offset
 * is always asked of Intl for the specific instant, so the code stays
 * correct for any zone including ones that observe DST — Pakistan currently
 * does not, but hardcoding +5 anywhere would be a latent bug rather than a
 * simplification.
 *
 * lib/editorial-checklist.ts builds its day-boundary helpers on offsetMillisAt
 * below rather than keeping a second copy.
 */

/** How far `timeZone` is ahead of UTC at the instant `utcMillis` represents —
 *  e.g. +5h for Asia/Karachi. Positive means ahead of UTC. */
export function offsetMillisAt(utcMillis: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMillis));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // hourCycle h23 can report hour 24 for midnight in some engines.
  const hour = get("hour") % 24;
  const shownAsUtcMillis = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return shownAsUtcMillis - utcMillis;
}

/**
 * The UTC instant that displays as the given wall-clock time in `timeZone`.
 *
 * Two passes: the first estimates the offset from a naive guess, the second
 * refines it. Each pass re-applies the offset to the ORIGINAL naive guess
 * rather than compounding an already-corrected value, so a constant-offset
 * zone converges immediately and never double-shifts.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveGuessMillis = Date.UTC(year, month - 1, day, hour, minute, 0);
  let corrected = naiveGuessMillis;
  for (let pass = 0; pass < 2; pass++) {
    corrected = naiveGuessMillis - offsetMillisAt(corrected, timeZone);
  }
  return new Date(corrected);
}

/**
 * Parses the value of an <input type="datetime-local"> ("YYYY-MM-DDTHH:mm")
 * as a wall-clock time in `timeZone`.
 *
 * The browser sends no offset in that value, and `new Date(str)` then treats
 * it as the *runtime's* local time — UTC on the server. So an editor typing
 * 16:00 meaning 4pm Pakistan produced 16:00 UTC, i.e. a 9pm PKT publish,
 * five hours late. Returns null for empty or unparseable input rather than
 * an Invalid Date.
 */
export function parseZonedDateTimeLocal(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = zonedWallClockToUtc(Number(y), Number(mo), Number(d), Number(h), Number(mi), timeZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats an instant as an <input type="datetime-local"> value showing the
 * wall-clock time in `timeZone` — the inverse of parseZonedDateTimeLocal.
 *
 * Previously the editor used toISOString().slice(0, 16), which shows the UTC
 * wall clock: an article scheduled for 4pm Pakistan appeared in the field as
 * 11:00.
 */
export function toZonedDateTimeLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
