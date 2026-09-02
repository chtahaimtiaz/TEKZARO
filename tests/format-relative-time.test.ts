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

  it("falls back to a plain date beyond a week", () => {
    const old = new Date(now.getTime() - 10 * 24 * 60 * 60_000);
    expect(formatRelativeTime(old, now)).toBe(old.toLocaleDateString());
  });

  it("a future date (clock skew) doesn't produce a negative/garbled string", () => {
    const future = new Date(now.getTime() + 60_000);
    expect(formatRelativeTime(future, now)).toBe(future.toLocaleDateString());
  });
});
