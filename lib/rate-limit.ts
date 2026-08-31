import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";

export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

/**
 * Fixed-window rate limiter backed by Postgres (RateLimitHit), not
 * in-memory — Vercel serverless functions don't share memory across
 * instances, so an in-memory counter would silently do nothing under real
 * traffic. This is deliberately an MVP-scale implementation: a row
 * insert+count per rate-limited request is fine at TEKZARO's current
 * traffic, but is not the design for a high-traffic endpoint indefinitely.
 * If usage grows enough for this table's write volume to matter, the
 * natural upgrade is a Redis/Upstash-backed limiter — not built here since
 * it would add external infra nobody has asked for yet.
 *
 * Returns true if the request is allowed (and records it), false if the
 * caller is over the limit for this window.
 */
export async function checkRateLimit(key: string, { max, windowMs }: RateLimitOptions): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs);

  const recentCount = await prisma.rateLimitHit.count({
    where: { key, createdAt: { gte: windowStart } },
  });

  if (recentCount >= max) return false;

  await prisma.rateLimitHit.create({ data: { key } });

  // Opportunistic cleanup of this key's own stale rows — keeps the table
  // bounded without a separate cron job. Best-effort: never block the
  // caller on it.
  prisma.rateLimitHit
    .deleteMany({ where: { key, createdAt: { lt: windowStart } } })
    .catch(() => {});

  return true;
}

/**
 * Client-IP extraction, deliberately not a naive first-entry
 * `x-forwarded-for` read — that value can contain attacker-supplied
 * entries from hops before Vercel's own edge.
 *
 * Verified against Vercel's platform docs (vercel.com/docs/headers/request-headers)
 * at implementation time: by default Vercel's edge overwrites
 * `x-forwarded-for` itself and does not forward a client-supplied value —
 * IP spoofing via that header is prevented unless the deployment has
 * Enterprise's "trusted proxy" feature enabled to sit another proxy in
 * front of Vercel. `x-vercel-forwarded-for` is documented as carrying the
 * same value, specifically for cases where `x-forwarded-for` might get
 * rewritten by something else in the chain, so it's preferred here as the
 * more explicitly Vercel-authored signal. If this deployment is later put
 * behind another CDN/proxy (e.g. Cloudflare) in front of Vercel, this
 * needs re-verification against that specific topology — the fallback
 * below (last `x-forwarded-for` entry, i.e. the hop nearest Vercel's edge,
 * rather than the first, client-controlled entry) is the safer default in
 * an unknown multi-hop chain, but is not a substitute for that
 * re-verification.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();

  const vercelForwardedFor = h.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) return vercelForwardedFor.split(",")[0].trim();

  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return "unknown";
}
