import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { GET as ingestNews } from "../app/api/cron/ingest-news/route";
import { getEligibleActiveSources } from "../lib/ingestion/batch-fetch";
import { cleanupRateLimitKey } from "./helpers";

const createdSourceIds: string[] = [];
// This test suite runs against the same shared dev database used all
// session, not an isolated test DB — if it left any real, currently-active
// Source rows in scope, running these tests would trigger real network
// fetches (and real image downloads/uploads) as a side effect of running
// the test suite. Temporarily deactivate every other active source for the
// duration of this file, and restore them afterward, so only the sources
// this file creates itself are ever actually ingested.
let deactivatedSourceIds: string[] = [];

async function makeSource(label: string, feedUrl: string) {
  const source = await prisma.source.create({
    data: {
      name: `Cron Test Source ${label} ${Date.now()}`,
      url: "https://example.invalid",
      feedUrl,
      type: "RSS",
      tier: "TIER_3",
      active: true,
    },
  });
  createdSourceIds.push(source.id);
  return source;
}

function makeRequest(auth: string | null): NextRequest {
  const headers = new Headers();
  if (auth !== null) headers.set("authorization", auth);
  return new NextRequest("http://localhost/api/cron/ingest-news", { headers });
}

// This file makes several real GET calls to the route in quick succession
// and (mostly) expects every one of them to actually run, not the
// PipelineSchedule no-op fast-path. lastIngestionRunAt is what actually
// gates that — a null value always means "run", regardless of whatever
// ingestionIntervalMinutes another test FILE running concurrently in a
// different vitest worker happens to have set on this same shared singleton
// row (tests/pipeline-schedule.test.ts also writes to it) — so this resets
// only that field, immediately before every test, rather than pinning the
// interval itself, which would still be racy against a concurrent writer.
async function resetForAlwaysRun() {
  await prisma.pipelineSchedule.upsert({
    where: { id: "singleton" },
    update: { lastIngestionRunAt: null },
    create: { id: "singleton", lastIngestionRunAt: null },
  });
}

beforeAll(async () => {
  // getClientIp() resolves to "unknown" outside a real request in tests —
  // same reasoning as tests/cron-publish-scheduled.test.ts.
  await cleanupRateLimitKey("cron-ingest-news:unknown");

  // Same eligibility criteria the route itself uses (lib/ingestion/batch-fetch.ts)
  // — GOOGLE_NEWS sources have no feedUrl but are still eligible, and
  // production now has several real, permanent ones (Stage 6B). Missing
  // that OR clause here left them active and got them really fetched by
  // every test run in this file, each one a real, possibly slow
  // news.google.com round trip — a real, deterministic multi-minute hang,
  // not flakiness.
  const otherActiveSources = await getEligibleActiveSources();
  deactivatedSourceIds = otherActiveSources.map((s) => s.id);
  if (deactivatedSourceIds.length) {
    await prisma.source.updateMany({ where: { id: { in: deactivatedSourceIds } }, data: { active: false } });
  }
});

beforeEach(resetForAlwaysRun);

afterAll(async () => {
  if (createdSourceIds.length) {
    await prisma.source.deleteMany({ where: { id: { in: createdSourceIds } } });
  }
  if (deactivatedSourceIds.length) {
    await prisma.source.updateMany({ where: { id: { in: deactivatedSourceIds } }, data: { active: true } });
  }
  await cleanupRateLimitKey("cron-ingest-news:unknown");
});

describe("GET /api/cron/ingest-news", () => {
  it("rejects a request with no/incorrect bearer token", async () => {
    const res1 = await ingestNews(makeRequest(null));
    expect(res1.status).toBe(401);

    const res2 = await ingestNews(makeRequest("Bearer wrong-secret"));
    expect(res2.status).toBe(401);
  });

  it("runs cleanly with zero active sources and returns the expected summary shape", async () => {
    const res = await ingestNews(makeRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      sourcesChecked: 0,
      sourcesFailed: 0,
      itemsCreated: 0,
      itemsSkippedExisting: 0,
      itemsDeprioritizedNonTech: 0,
      imagesAcquired: 0,
      imagesNeedingReview: 0,
      imagesFailed: 0,
    });
  });

  it("a source that fails to fetch doesn't stop the run — both sources are attempted and the failure is recorded", async () => {
    // .invalid is IANA-reserved (RFC 2606) to never resolve — a real,
    // deterministic DNS-failure path through safeFetch, no network mocking.
    const bad1 = await makeSource("bad1", "https://this-does-not-resolve-1.invalid/feed.xml");
    const bad2 = await makeSource("bad2", "https://this-does-not-resolve-2.invalid/feed.xml");

    const before = await prisma.source.findMany({
      where: { id: { in: [bad1.id, bad2.id] } },
      select: { id: true, lastError: true },
    });
    expect(before.every((s) => s.lastError === null)).toBe(true);

    const res = await ingestNews(makeRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourcesChecked).toBe(2);
    expect(body.sourcesFailed).toBe(2);

    // Both sources were actually attempted (ingestSource records lastError
    // per-source), not just the first one before the loop gave up.
    const after = await prisma.source.findMany({
      where: { id: { in: [bad1.id, bad2.id] } },
      select: { id: true, lastError: true },
    });
    expect(after.every((s) => s.lastError !== null)).toBe(true);
  });

  it("processes more sources than the concurrency limit — proves the worker pool drains a second wave, not just up to its own size", async () => {
    // Route's CONCURRENCY constant is 4 — 6 sources forces the pool to pick
    // up a second batch after the first 4 finish, which a 2-source test
    // (fitting entirely within one wave) can never exercise.
    const labels = ["a", "b", "c", "d", "e", "f"];
    const sources = await Promise.all(
      labels.map((l) => makeSource(`wave-${l}`, `https://this-does-not-resolve-wave-${l}.invalid/feed.xml`)),
    );

    const res = await ingestNews(makeRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    // >= rather than exact equality: earlier tests in this same file (e.g.
    // "a source that fails to fetch...") create their own active sources
    // and only clean them up in this file's afterAll, not between tests —
    // so this run may legitimately see more than just the 6 sources created
    // here. The property this test actually cares about — every source this
    // test itself created gets attempted, not just the first CONCURRENCY of
    // them — is the `after` check below, which is exact.
    expect(body.sourcesChecked).toBeGreaterThanOrEqual(6);
    expect(body.sourcesFailed).toBeGreaterThanOrEqual(6);

    const after = await prisma.source.findMany({
      where: { id: { in: sources.map((s) => s.id) } },
      select: { lastError: true },
    });
    expect(after).toHaveLength(6);
    expect(after.every((s) => s.lastError !== null)).toBe(true);
  });

  it("returns {skipped:true} without touching any source when the configured interval hasn't elapsed yet", async () => {
    // Deliberately the opposite of this file's beforeEach reset (which
    // always sets lastIngestionRunAt to null so every other test's call
    // actually runs) — proves the PipelineSchedule gate actually blocks a
    // too-soon call, not just that the un-gated path still works. Setting
    // both fields together, immediately before the call, keeps this
    // deterministic even against a concurrently-running test file that may
    // be writing ingestionIntervalMinutes on this same shared singleton row
    // at the same time (any positive interval combined with a just-now
    // lastIngestionRunAt still yields "not elapsed").
    await prisma.pipelineSchedule.update({
      where: { id: "singleton" },
      data: { ingestionIntervalMinutes: 60, lastIngestionRunAt: new Date() },
    });

    const res = await ingestNews(makeRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skipped: true, reason: "interval not elapsed" });
  });
});
