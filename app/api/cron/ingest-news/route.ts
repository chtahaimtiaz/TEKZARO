import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSystemUserId } from "@/lib/system-actor";
import { ingestSource } from "@/lib/ingestion/ingest";
import { logSystemEvent } from "@/lib/monitoring";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getPipelineSchedule, shouldRunIngestion, recordIngestionRun } from "@/lib/pipeline-schedule";

export const dynamic = "force-dynamic";
// Hobby plan (with Fluid Compute) caps functions at 300s — there is no
// higher ceiling to request on this plan. Set explicitly so the real
// constraint is visible in the file, not just riding an implicit default
// that could silently change. See CONCURRENCY note below for how this
// route stays well under it even as the source list grows.
export const maxDuration = 300;

/**
 * Runs ingestion for every active Source with a feed URL, once per
 * invocation. Kept separate from /api/cron/publish-scheduled — different
 * responsibility, different failure mode, so one never takes the other
 * down.
 *
 * Not driven by Vercel's own Cron: this Vercel account is on the Hobby
 * plan, which only allows a native cron schedule to run once per day (the
 * same limit that forced publish-scheduled to once-daily). Hourly
 * ingestion instead runs via a GitHub Actions scheduled workflow
 * (.github/workflows/hourly-ingest.yml) hitting this endpoint — still just
 * gated on CRON_SECRET like any external scheduler, not locked to GitHub
 * specifically.
 *
 * Reuses the exact same ingestSource() function the admin "fetch now"
 * manual trigger uses (lib/source-actions.ts's fetchSourceAction) — same
 * per-source failure isolation (ingestSource itself never throws), just
 * iterating every active source instead of one, and attributed to the
 * SYSTEM actor instead of a session user.
 *
 * Sources are processed CONCURRENCY at a time rather than one-at-a-time —
 * a real production run with 15 active sources timed out under the old
 * sequential loop (each source's RSS fetch + per-item image acquisition
 * fully awaited before the next source started). Bounded concurrency
 * keeps wall-clock roughly proportional to source-count/CONCURRENCY
 * instead of source-count, without hammering the DB connection pool or
 * outbound network with all sources at once.
 */
const CONCURRENCY = 4;

async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`cron-ingest-news:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // The GitHub Actions workflow polls this endpoint on a tight fixed
  // schedule; the actual ingestion cadence is admin-controlled via
  // PipelineSchedule.ingestionIntervalMinutes (app/admin/(protected)/monitoring)
  // so a poll that arrives before the configured interval has elapsed is a
  // cheap no-op rather than a real ingestion run.
  const schedule = await getPipelineSchedule();
  if (!shouldRunIngestion(schedule)) {
    return NextResponse.json({ skipped: true, reason: "interval not elapsed" });
  }

  const systemUserId = await getSystemUserId();
  const sources = await prisma.source.findMany({
    where: { active: true, feedUrl: { not: null } },
    select: { id: true, name: true },
  });

  let itemsCreated = 0;
  let itemsSkippedExisting = 0;
  let itemsDeprioritizedNonTech = 0;
  let imagesAcquired = 0;
  let imagesNeedingReview = 0;
  let imagesFailed = 0;
  let sourcesFailed = 0;

  await runWithConcurrency(sources, CONCURRENCY, async (source) => {
    try {
      const result = await ingestSource(source.id, systemUserId);
      if (result.ok) {
        itemsCreated += result.itemsCreated;
        itemsSkippedExisting += result.itemsSkippedExisting;
        itemsDeprioritizedNonTech += result.itemsDeprioritizedNonTech;
        imagesAcquired += result.imagesAcquired;
        imagesNeedingReview += result.imagesNeedingReview;
        imagesFailed += result.imagesFailed;
      } else {
        sourcesFailed++;
      }
    } catch {
      // Defense-in-depth beyond ingestSource's own never-throws guarantee —
      // one source must never abort the run for the rest.
      sourcesFailed++;
    }
  });

  const summary = {
    sourcesChecked: sources.length,
    sourcesFailed,
    itemsCreated,
    itemsSkippedExisting,
    itemsDeprioritizedNonTech,
    imagesAcquired,
    imagesNeedingReview,
    imagesFailed,
  };

  await logSystemEvent({
    level: sourcesFailed > 0 ? "WARN" : "INFO",
    source: "cron.ingest-news",
    message: `Checked ${sources.length} source(s): ${itemsCreated} new item(s), ${itemsSkippedExisting} already existed, ${sourcesFailed} source failure(s).`,
    context: summary,
  });
  await recordIngestionRun();

  return NextResponse.json(summary);
}
