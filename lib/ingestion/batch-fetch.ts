import "server-only";
import { prisma } from "../prisma";
import { ingestSource } from "./ingest";
import { ingestGoogleNewsSource } from "./google-news";

/**
 * Shared by the ingestion cron route (app/api/cron/ingest-news/route.ts)
 * and the admin "Fetch All" action (lib/source-actions.ts) — one batch
 * ingestion implementation, not two. Both callers hit the exact same
 * per-source branching, concurrency, and failure isolation; only the
 * trigger (scheduler vs. an admin click) and the actor id differ.
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

export interface BatchIngestionSummary {
  sourcesChecked: number;
  sourcesFailed: number;
  itemsCreated: number;
  itemsSkippedExisting: number;
  itemsDeprioritizedNonTech: number;
  /** Per-source outcome, for admin-facing "which ones failed and why" —
   * the cron route ignores this and only logs the aggregate; the admin
   * action surfaces it directly. */
  perSource: { sourceId: string; name: string; ok: boolean; error?: string }[];
}

/** Every active Source eligible for automated ingestion — RSS/Atom/etc.
 * with a real feedUrl, or any GOOGLE_NEWS source (which computes its query
 * live instead of storing a feedUrl). Same eligibility rule the cron route
 * has always used. */
export async function getEligibleActiveSources(): Promise<{ id: string; name: string; type: string }[]> {
  return prisma.source.findMany({
    where: { active: true, OR: [{ feedUrl: { not: null } }, { type: "GOOGLE_NEWS" }] },
    select: { id: true, name: true, type: true },
  });
}

export async function runBatchIngestion(
  sources: { id: string; name: string; type: string }[],
  requestedById: string,
): Promise<BatchIngestionSummary> {
  let itemsCreated = 0;
  let itemsSkippedExisting = 0;
  let itemsDeprioritizedNonTech = 0;
  let sourcesFailed = 0;
  const perSource: BatchIngestionSummary["perSource"] = [];

  await runWithConcurrency(sources, CONCURRENCY, async (source) => {
    try {
      const result =
        source.type === "GOOGLE_NEWS"
          ? await ingestGoogleNewsSource(source.id, requestedById)
          : await ingestSource(source.id, requestedById);
      if (result.ok) {
        itemsCreated += result.itemsCreated;
        itemsSkippedExisting += result.itemsSkippedExisting;
        itemsDeprioritizedNonTech += result.itemsDeprioritizedNonTech;
        perSource.push({ sourceId: source.id, name: source.name, ok: true });
      } else {
        sourcesFailed++;
        perSource.push({ sourceId: source.id, name: source.name, ok: false, error: result.error });
      }
    } catch (err) {
      // Defense-in-depth beyond ingestSource/ingestGoogleNewsSource's own
      // never-throws guarantee — one source must never abort the run for
      // the rest.
      sourcesFailed++;
      perSource.push({ sourceId: source.id, name: source.name, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return {
    sourcesChecked: sources.length,
    sourcesFailed,
    itemsCreated,
    itemsSkippedExisting,
    itemsDeprioritizedNonTech,
    perSource,
  };
}
