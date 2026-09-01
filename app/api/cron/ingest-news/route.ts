import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSystemUserId } from "@/lib/system-actor";
import { ingestSource } from "@/lib/ingestion/ingest";
import { logSystemEvent } from "@/lib/monitoring";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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
 */
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

  for (const source of sources) {
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
  }

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

  return NextResponse.json(summary);
}
