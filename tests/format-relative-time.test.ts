import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "../lib/format-relative-time";

const now = new Date("2026-06-15T12:00:00Z");

describe("formatRelativeTime", () => {
  it("just now for anything under a minute", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 30_000), now)).toBe("Just now");
  });

  it("singular vs plural minutes", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 60_000), now)).toBe("1 minute ago");
    expect(formatRelativeTime(new Date(now.getTime() - 18 * 60_000), now)).toBe("18 minutes ago");
  });

  it("singular vs plural hours", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 60 * 60_000), now)).toBe("1 hour ago");
    expect(formatRelativeTime(new Date(now.getTime() - 5 * 60 * 60_000), now)).toBe("5 hours ago");
  });

  it("yesterday for 1-2 days back", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 30 * 60 * 60_000), now)).toBe("Yesterday");
  });

  it("days ago for 2-7 days back", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 3 * 24 * 60 * 60_000), now)).toBe("3 days ago");
  });

  // These two previously asserted the result equalled the input's own
  // .toLocaleDateString(), which was tautological against the old
  // implementation and depended on the runtime's zone and locale — the exact
  // dependence that let the five-hours-early display bug ship. They now
  // assert the literal Pakistan-formatted output, which is deterministic.
  it("falls back to a plain Asia/Karachi date beyond a week", () => {
    // 2026-06-05T12:00Z is 17:00 the same day in Pakistan.
    const old = new Date(now.getTime() - 10 * 24 * 60 * 60_000);
    expect(formatRelativeTime(old, now)).toBe("Jun 5, 2026");
  });

  it("a future date (clock skew) doesn't produce a negative/garbled string", () => {
    const future = new Date(now.getTime() + 60_000);
    expect(formatRelativeTime(future, now)).toBe("Jun 15, 2026");
  });
});
