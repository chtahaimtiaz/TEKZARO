import { NextResponse, type NextRequest } from "next/server";
import { processVerificationBatch } from "@/lib/verification-actions";
import { deduplicateArticles } from "@/lib/article-dedup";
import { logSystemEvent } from "@/lib/monitoring";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// See app/api/cron/ingest-news/route.ts for why this is set explicitly —
// 300s is already the Hobby-plan default/max, this just self-documents it.
// Real headroom here comes from VERIFY_BATCH_SIZE staying small (quota- and
// cost-bounded, see .env.example), not from this ceiling.
export const maxDuration = 300;

/**
 * Runs one bounded batch of verification+synthesis over freshly-discovered
 * SourceItems, auto-publishing only the ones that clear every check in
 * lib/verification-actions.ts's gate. Kept separate from
 * /api/cron/ingest-news — different responsibility (discovery vs.
 * verify-and-publish), different failure mode, so one never takes the other
 * down. Runs via the same GitHub Actions workflow
 * (.github/workflows/hourly-ingest.yml) as a second step, after ingestion,
 * gated on the same CRON_SECRET.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`cron-verify-publish:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const summary = await processVerificationBatch();

  await logSystemEvent({
    level: summary.failed > 0 || summary.skippedNoEligibleAuthor > 0 ? "WARN" : "INFO",
    source: "cron.verify-publish",
    message: `Processed ${summary.itemsProcessed} item(s): ${summary.autoPublished} auto-published, ${summary.sentToReview} sent to review, ${summary.skippedNoDraft} skipped (no draft), ${summary.skippedNoEligibleAuthor} skipped (no eligible author), ${summary.failed} failed.`,
    context: summary as unknown as Record<string, unknown>,
  });

  // Runs every invocation (not just when this batch created something) —
  // the pipeline has drafted the same widely-syndicated story more than
  // once across separate runs before, so this is the ongoing safety net,
  // not a one-time fix. logs its own SystemEvent only when it actually
  // removes something.
  const dedup = await deduplicateArticles();

  return NextResponse.json({ ...summary, duplicatesRemoved: dedup.articlesDeleted });
}
