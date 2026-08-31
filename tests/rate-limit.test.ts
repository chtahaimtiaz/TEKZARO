import { describe, it, expect, afterEach } from "vitest";
import { checkRateLimit, getClientIp } from "../lib/rate-limit";
import { setMockHeader, clearMockHeaders, cleanupRateLimitKey } from "./helpers";

describe("checkRateLimit", () => {
  const testKey = `rl-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  afterEach(async () => {
    await cleanupRateLimitKey(testKey);
  });

  it("allows requests under the limit and records each one", async () => {
    expect(await checkRateLimit(testKey, { max: 3, windowMs: 60_000 })).toBe(true);
    expect(await checkRateLimit(testKey, { max: 3, windowMs: 60_000 })).toBe(true);
    expect(await checkRateLimit(testKey, { max: 3, windowMs: 60_000 })).toBe(true);
  });

  it("rejects once the limit is reached within the window", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await checkRateLimit(testKey, { max: 3, windowMs: 60_000 })).toBe(true);
    }
    expect(await checkRateLimit(testKey, { max: 3, windowMs: 60_000 })).toBe(false);
  });

  it("tracks different keys independently", async () => {
    const otherKey = `${testKey}-other`;
    try {
      for (let i = 0; i < 3; i++) {
        await checkRateLimit(testKey, { max: 3, windowMs: 60_000 });
      }
      expect(await checkRateLimit(testKey, { max: 3, windowMs: 60_000 })).toBe(false);
      // A different key hasn't hit its own limit yet.
      expect(await checkRateLimit(otherKey, { max: 3, windowMs: 60_000 })).toBe(true);
    } finally {
      await cleanupRateLimitKey(otherKey);
    }
  });

  it("a very short window effectively resets the count", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(testKey, { max: 3, windowMs: 1 });
    }
    await new Promise((r) => setTimeout(r, 20));
    // The prior hits are now outside a 1ms window, so this should be allowed again.
    expect(await checkRateLimit(testKey, { max: 3, windowMs: 1 })).toBe(true);
  });
});

describe("getClientIp", () => {
  afterEach(() => clearMockHeaders());

  it("prefers x-vercel-forwarded-for when present, even over x-forwarded-for", async () => {
    setMockHeader("x-forwarded-for", "198.51.100.1");
    setMockHeader("x-vercel-forwarded-for", "203.0.113.9");
    expect(await getClientIp()).toBe("203.0.113.9");
  });

  it("falls back to the last entry of x-forwarded-for, not the first", async () => {
    clearMockHeaders();
    // Simulate a multi-hop chain: client-claimed IP first (untrusted), then
    // the hop nearest the edge last (trusted).
    setMockHeader("x-forwarded-for", "198.51.100.1, 203.0.113.55");
    expect(await getClientIp()).toBe("203.0.113.55");
  });

  it("returns 'unknown' when no forwarding header is present", async () => {
    clearMockHeaders();
    expect(await getClientIp()).toBe("unknown");
  });
});
