import "server-only";
import { prisma } from "../prisma";
import type { AcquisitionOutcome } from "./acquire";

/**
 * Acquisition metrics, computed from data the pipeline already writes —
 * deliberately not a separate counters table that could drift out of sync
 * with reality. SystemEvent rows carry the per-attempt outcome (see
 * recordAcquisitionOutcome), and Media/Article rows carry the end state.
 */
export interface AcquisitionMetrics {
  windowHours: number;
  attempts: number;
  byOutcome: Record<string, number>;
  /** ATTACHED + DEDUPED over all attempts — the number that matters: an
   * image that actually reached R2 and a Media row. */
  successRate: number;
  mediaStored: number;
  /** Media rows attached to no article — the orphan measure that the old
   * eager-acquisition behaviour blew up to 1,975. */
  orphanMedia: number;
  publishedArticlesWithImage: number;
  publishedArticlesTotal: number;
}

export const ACQUISITION_EVENT_SOURCE = "images.acquire.outcome";

/** One structured, countable row per acquisition attempt. Kept separate
 * from the human-readable images.acquire log so metrics never have to
 * parse prose. */
export async function recordAcquisitionOutcome(input: {
  outcome: AcquisitionOutcome;
  sourceItemId: string;
  sourceDomain: string | null;
  candidateUrl?: string | null;
  httpStatus?: number | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  reason?: string | null;
}): Promise<void> {
  await prisma.systemEvent
    .create({
      data: {
        level: input.outcome === "ATTACHED" || input.outcome === "DEDUPED" ? "INFO" : "WARN",
        source: ACQUISITION_EVENT_SOURCE,
        message: `${input.outcome} ${input.sourceDomain ?? "unknown"}${input.reason ? ` — ${input.reason}` : ""}`,
        context: {
          outcome: input.outcome,
          sourceItemId: input.sourceItemId,
          sourceDomain: input.sourceDomain,
          candidateUrl: input.candidateUrl ?? null,
          httpStatus: input.httpStatus ?? null,
          contentType: input.contentType ?? null,
          sizeBytes: input.sizeBytes ?? null,
        },
      },
    })
    .catch(() => {
      // Best-effort observability, exactly like logSystemEvent — a metrics
      // write must never fail an acquisition that otherwise succeeded.
    });
}

export async function getAcquisitionMetrics(windowHours = 24): Promise<AcquisitionMetrics> {
  const since = new Date(Date.now() - windowHours * 3600 * 1000);

  const events = await prisma.systemEvent.findMany({
    where: { source: ACQUISITION_EVENT_SOURCE, createdAt: { gte: since } },
    select: { context: true },
  });

  const byOutcome: Record<string, number> = {};
  for (const e of events) {
    const outcome = (e.context as { outcome?: string } | null)?.outcome ?? "UNKNOWN";
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
  }
  const succeeded = (byOutcome.ATTACHED ?? 0) + (byOutcome.DEDUPED ?? 0);

  const [mediaStored, orphanMedia, publishedArticlesTotal, publishedArticlesWithImage] = await Promise.all([
    prisma.media.count(),
    prisma.media.count({ where: { featuredOnArticles: { none: {} }, articleId: null } }),
    prisma.article.count({ where: { status: "PUBLISHED", isDemo: false } }),
    prisma.article.count({ where: { status: "PUBLISHED", isDemo: false, featuredImageUrl: { not: null } } }),
  ]);

  return {
    windowHours,
    attempts: events.length,
    byOutcome,
    successRate: events.length === 0 ? 0 : succeeded / events.length,
    mediaStored,
    orphanMedia,
    publishedArticlesWithImage,
    publishedArticlesTotal,
  };
}
