import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { formatDate, formatDateTime, timeAgo } from "../lib/format";
import { formatRelativeTime } from "../lib/format-relative-time";
import { EDITORIAL_TIMEZONE } from "../lib/constants";
import { parseZonedDateTimeLocal, toZonedDateTimeLocal } from "../lib/timezone";
import { buildArticleJsonLd } from "../lib/seo";
import type { ArticleWithRelations } from "../lib/types";

/**
 * Regression cover for the production bug where every visible timestamp
 * rendered five hours early.
 *
 * lib/format.ts called Intl.DateTimeFormat with no timeZone option, which
 * means "use the runtime's zone". On a developer machine in Pakistan that
 * looked correct; on Vercel the runtime is UTC, so an article published at
 * 16:30 PKT displayed as 11:30 AM on every public page.
 *
 * The stored instants were never wrong, so nothing here asserts a shifted
 * timestamp — these assert that one fixed instant renders as the correct
 * Pakistan wall-clock time, and that the machine-readable ISO value for
 * that same instant is untouched.
 */

// 2026-09-04T11:30:00Z is 16:30 on the same day in Asia/Karachi (UTC+5).
const AFTERNOON_UTC = new Date("2026-09-04T11:30:00.000Z");

describe("visible timestamps render in Asia/Karachi", () => {
  it("is configured for Pakistan", () => {
    expect(EDITORIAL_TIMEZONE).toBe("Asia/Karachi");
  });

  it("shows a 16:30 PKT publication as 4:30 PM, not 11:30 AM", () => {
    const shown = formatDateTime(AFTERNOON_UTC);
    expect(shown).toContain("4:30 PM");
    expect(shown).not.toContain("11:30 AM");
    expect(shown).toContain("Sep 4, 2026");
  });

  it("renders the same instant identically no matter what zone is requested for UTC", () => {
    // Explicitly asking for UTC must still be possible — the default is
    // Pakistan, not a hardcoded conversion.
    expect(formatDateTime(AFTERNOON_UTC, "UTC")).toContain("11:30 AM");
    expect(formatDateTime(AFTERNOON_UTC)).toContain("4:30 PM");
  });

  it("does not shift the underlying instant", () => {
    const before = AFTERNOON_UTC.getTime();
    formatDate(AFTERNOON_UTC);
    formatDateTime(AFTERNOON_UTC);
    timeAgo(AFTERNOON_UTC);
    expect(AFTERNOON_UTC.getTime()).toBe(before);
    expect(AFTERNOON_UTC.toISOString()).toBe("2026-09-04T11:30:00.000Z");
  });
});

describe("midnight boundaries — where the calendar date itself can slip", () => {
  it("puts 20:00 UTC on the NEXT day in Pakistan", () => {
    // 2026-09-04T20:00Z = 2026-09-05 01:00 PKT.
    const d = new Date("2026-09-04T20:00:00.000Z");
    expect(formatDate(d)).toBe("Sep 5, 2026");
    expect(formatDateTime(d)).toContain("1:00 AM");
    // Rendered in UTC it would still read Sep 4 — that difference is the bug.
    expect(formatDate(d, "UTC")).toBe("Sep 4, 2026");
  });

  it("keeps 18:59 UTC on the same Pakistan day", () => {
    // 2026-09-04T18:59Z = 2026-09-04 23:59 PKT — the last minute of the day.
    const d = new Date("2026-09-04T18:59:00.000Z");
    expect(formatDate(d)).toBe("Sep 4, 2026");
    expect(formatDateTime(d)).toContain("11:59 PM");
  });

  it("puts 19:00 UTC over midnight into the next Pakistan day", () => {
    const d = new Date("2026-09-04T19:00:00.000Z");
    expect(formatDate(d)).toBe("Sep 5, 2026");
    expect(formatDateTime(d)).toContain("12:00 AM");
  });

  it("handles a month boundary", () => {
    // 2026-09-30T19:30Z = 2026-10-01 00:30 PKT.
    const d = new Date("2026-09-30T19:30:00.000Z");
    expect(formatDate(d)).toBe("Oct 1, 2026");
  });
});

describe("relative time is zone-independent arithmetic", () => {
  it("measures elapsed time from absolute instants, unaffected by zone", () => {
    const now = new Date("2026-09-04T11:30:00.000Z");
    const thirtyMinutesEarlier = new Date(now.getTime() - 30 * 60_000);
    // Would read "5 hours ago" if a zone offset leaked into the arithmetic.
    expect(formatRelativeTime(thirtyMinutesEarlier, now)).toBe("30 minutes ago");
  });

  it("falls back to a Pakistan-formatted date beyond a week", () => {
    const now = new Date("2026-09-20T11:30:00.000Z");
    expect(formatRelativeTime(new Date("2026-09-04T20:00:00.000Z"), now)).toBe("Sep 5, 2026");
  });
});

describe("machine-readable timestamps stay absolute", () => {
  const article = {
    slug: "s",
    title: "T",
    excerpt: "E",
    metaDescription: null,
    canonicalUrl: null,
    ogImage: null,
    featuredImageUrl: null,
    publishedAt: AFTERNOON_UTC,
    updatedAt: new Date("2026-09-04T12:00:00.000Z"),
    author: { name: "A", slug: "a" },
    category: { name: "C", slug: "c" },
    tags: [],
  } as unknown as ArticleWithRelations;

  it("keeps datePublished and dateModified as the true UTC instants", () => {
    const ld = buildArticleJsonLd(article) as Record<string, unknown>;
    // Structured data must stay unambiguous ISO-8601 — localising it would
    // be the actual data corruption this fix exists to avoid.
    expect(ld.datePublished).toBe("2026-09-04T11:30:00.000Z");
    expect(ld.dateModified).toBe("2026-09-04T12:00:00.000Z");
    expect(String(ld.datePublished)).toMatch(/Z$/);
    expect(new Date(ld.datePublished as string).getTime()).toBe(AFTERNOON_UTC.getTime());
  });
});

describe("no manual offset workaround exists", () => {
  it("never adds or subtracts a fixed five hours anywhere in the date code", () => {
    for (const file of ["lib/format.ts", "lib/format-relative-time.ts"]) {
      const src = readFileSync(file, "utf8");
      // The wrong fix: shifting the instant instead of choosing a zone.
      expect(src).not.toMatch(/5\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
      expect(src).not.toMatch(/18000000/);
      expect(src).not.toMatch(/setHours\(/);
      expect(src).not.toMatch(/getTimezoneOffset\(/);
    }
  });

  it("passes an IANA zone to Intl rather than formatting in the runtime zone", () => {
    const src = readFileSync("lib/format.ts", "utf8");
    expect(src).toContain("timeZone");
    expect(src).toContain("EDITORIAL_TIMEZONE");
  });
});

describe("scheduling input round trip (Pakistan wall-clock <-> instant)", () => {
  it("reads 16:00 in the field as 4pm Pakistan, not 4pm UTC", () => {
    const parsed = parseZonedDateTimeLocal("2026-09-04T16:00", EDITORIAL_TIMEZONE)!;
    // 16:00 PKT is 11:00 UTC. Parsed with new Date() on a UTC server it
    // would have been 16:00Z — a 9pm PKT publish, five hours late.
    expect(parsed.toISOString()).toBe("2026-09-04T11:00:00.000Z");
    expect(formatDateTime(parsed)).toContain("4:00 PM");
  });

  it("shows a stored instant back in the field as Pakistan wall-clock", () => {
    const stored = new Date("2026-09-04T11:00:00.000Z");
    expect(toZonedDateTimeLocal(stored, EDITORIAL_TIMEZONE)).toBe("2026-09-04T16:00");
    // The old toISOString().slice(0,16) showed the UTC clock instead.
    expect(stored.toISOString().slice(0, 16)).toBe("2026-09-04T11:00");
  });

  it("round trips without drift", () => {
    for (const wall of ["2026-09-04T00:00", "2026-09-04T16:00", "2026-09-04T23:59", "2026-12-31T23:30"]) {
      const instant = parseZonedDateTimeLocal(wall, EDITORIAL_TIMEZONE)!;
      expect(toZonedDateTimeLocal(instant, EDITORIAL_TIMEZONE)).toBe(wall);
    }
  });

  it("crosses midnight correctly in both directions", () => {
    // 00:30 PKT on the 5th is 19:30 UTC on the 4th.
    const parsed = parseZonedDateTimeLocal("2026-09-05T00:30", EDITORIAL_TIMEZONE)!;
    expect(parsed.toISOString()).toBe("2026-09-04T19:30:00.000Z");
    expect(toZonedDateTimeLocal(parsed, EDITORIAL_TIMEZONE)).toBe("2026-09-05T00:30");
  });

  it("returns null for empty or malformed input rather than an Invalid Date", () => {
    expect(parseZonedDateTimeLocal("", EDITORIAL_TIMEZONE)).toBeNull();
    expect(parseZonedDateTimeLocal("not-a-date", EDITORIAL_TIMEZONE)).toBeNull();
  });

  it("derives the offset from Intl rather than a hardcoded five hours", () => {
    const src = readFileSync("lib/timezone.ts", "utf8");
    expect(src).not.toMatch(/18000000|5\s*\*\s*60\s*\*\s*60/);
    expect(src).toContain("formatToParts");
  });
});
