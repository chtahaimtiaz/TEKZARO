import "server-only";
import { prisma } from "../prisma";
import { safeFetch } from "../security/safe-fetch";
import { isFetchAllowed } from "./robots";
import { parseFeed } from "./feed-parser";
import { normalizeTitle } from "./normalize";
import { findBestDuplicateMatch, AUTO_MERGE_THRESHOLD, type DuplicateCandidate } from "../discovery/duplicates";
import { classifyPakistanRelevance, relevanceScoreToPercent } from "../discovery/pakistan-relevance";
import { computePriorityScore } from "../discovery/priority";
import { logAction } from "../audit";
import { logSystemEvent } from "../monitoring";
import { acquireImageForSourceItem } from "../images/acquire";
import type { Prisma } from "@prisma/client";

const RECENT_CANDIDATE_WINDOW_DAYS = 14;
const RECENT_CANDIDATE_LIMIT = 300;

export interface IngestResult {
  ok: boolean;
  itemsSeen: number;
  itemsCreated: number;
  itemsSkippedExisting: number;
  error?: string;
}

async function getRecentCandidates(): Promise<DuplicateCandidate[]> {
  const since = new Date(Date.now() - RECENT_CANDIDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.sourceItem.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: RECENT_CANDIDATE_LIMIT,
    select: { id: true, clusterId: true, sourceUrl: true, canonicalUrl: true, normalizedTitle: true, sourceId: true, publishedAt: true },
  });
  return rows;
}

/**
 * Fetches and ingests one source's feed. Never throws to the caller — every
 * failure mode (robots disallow, network/timeout, malformed feed, DB error)
 * is caught, recorded on Source.lastError, and returned as a normal result
 * so a batch of sources can never be aborted by one bad feed.
 */
export async function ingestSource(sourceId: string, requestedById: string): Promise<IngestResult> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, itemsSeen: 0, itemsCreated: 0, itemsSkippedExisting: 0, error: "Source not found." };
  if (!source.active) return { ok: false, itemsSeen: 0, itemsCreated: 0, itemsSkippedExisting: 0, error: "Source is disabled." };
  if (!source.feedUrl) return { ok: false, itemsSeen: 0, itemsCreated: 0, itemsSkippedExisting: 0, error: "Source has no feed URL configured." };

  const recordError = async (message: string) => {
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastChecked: new Date(), lastError: message.slice(0, 500) },
    });
  };

  try {
    const allowed = await isFetchAllowed(source.feedUrl);
    if (!allowed) {
      await recordError("robots.txt disallows fetching this feed URL.");
      return { ok: false, itemsSeen: 0, itemsCreated: 0, itemsSkippedExisting: 0, error: "Blocked by robots.txt." };
    }

    const response = await safeFetch(source.feedUrl);
    if (response.status !== 200) {
      await recordError(`Feed returned HTTP ${response.status}.`);
      return { ok: false, itemsSeen: 0, itemsCreated: 0, itemsSkippedExisting: 0, error: `HTTP ${response.status}` };
    }

    const items = parseFeed(response.text);
    if (items.length === 0) {
      await recordError("Feed parsed but contained no usable items (empty or malformed).");
      // Not necessarily a hard failure — some feeds are legitimately empty —
      // but worth surfacing, so lastError is still set while lastSuccess
      // still updates below.
    }

    const [activeKeywords, priorityKeywords] = await Promise.all([
      prisma.keyword.findMany({ where: { active: true, type: { in: ["PAKISTAN", "COMPANY"] } } }),
      prisma.keyword.findMany({ where: { active: true, priority: true } }),
    ]);
    const candidates = await getRecentCandidates();

    let created = 0;
    let skippedExisting = 0;

    for (const item of items) {
      const existing = await prisma.sourceItem.findUnique({
        where: { sourceId_sourceUrl: { sourceId, sourceUrl: item.link } },
      });
      if (existing) {
        skippedExisting++;
        continue;
      }

      const normalizedTitle = normalizeTitle(item.title);
      const text = `${item.title} ${item.excerpt}`;
      const relevance = classifyPakistanRelevance(text, activeKeywords);
      const matchedPriorityKeywords = priorityKeywords
        .filter((k) => text.toLowerCase().includes(k.term.toLowerCase()))
        .map((k) => k.term);

      const match = findBestDuplicateMatch(
        { sourceUrl: item.link, canonicalUrl: item.canonicalUrl, normalizedTitle, sourceId, publishedAt: item.publishedAt },
        candidates,
      );

      const isExactDuplicate = match !== null && match.score >= 0.999;
      const isCorroboration = match !== null && !isExactDuplicate && match.score >= AUTO_MERGE_THRESHOLD;
      const isPossibleDuplicate = match !== null && !isExactDuplicate && !isCorroboration;

      let clusterId: string;
      if ((isExactDuplicate || isCorroboration) && match!.candidate.clusterId) {
        clusterId = match!.candidate.clusterId;
      } else {
        const cluster = await prisma.storyCluster.create({
          data: { title: item.title, duplicateScore: match?.score ?? 0 },
        });
        clusterId = cluster.id;
      }

      const corroboratingCount = await prisma.sourceItem.count({ where: { clusterId } });
      const priority = computePriorityScore({
        sourceTier: source.tier,
        publishedAt: item.publishedAt,
        pakistanRelevance: relevanceScoreToPercent(relevance.score),
        corroboratingSourceCount: corroboratingCount,
        headline: item.title,
        matchedPriorityKeywords,
      });

      const createdItem = await prisma.sourceItem.create({
        data: {
          sourceId,
          externalId: item.externalId,
          sourceUrl: item.link,
          canonicalUrl: item.canonicalUrl,
          headline: item.title,
          normalizedTitle,
          excerpt: item.excerpt,
          publishedAt: item.publishedAt,
          imageUrl: item.imageUrl,
          categoryId: source.categoryId,
          clusterId,
          pakistanRelevance: relevanceScoreToPercent(relevance.score),
          pakistanImpactLevel: relevance.level,
          pakistanImpactReasons: relevance.reasons as unknown as Prisma.InputJsonValue,
          duplicateScore: match?.score ?? 0,
          duplicateOfId: isExactDuplicate || isPossibleDuplicate ? match!.candidate.id : undefined,
          priorityScore: priority.score,
          priorityReasons: priority.reasons as unknown as Prisma.InputJsonValue,
          status: isExactDuplicate ? "DUPLICATE" : isPossibleDuplicate ? "POSSIBLE_DUPLICATE" : "NEW",
        },
      });

      // Isolated on purpose: an image problem (bad HTML, unreachable host,
      // no usable candidate, storage failure) must never abort ingestion of
      // this item or the batch — acquireImageForSourceItem itself already
      // never throws, this try/catch is defense-in-depth on top of that.
      try {
        const acquisition = await acquireImageForSourceItem({
          id: createdItem.id,
          sourceUrl: createdItem.sourceUrl,
          headline: createdItem.headline,
        });
        if (!acquisition.ok) {
          await logSystemEvent({
            level: "INFO",
            source: "images.acquire",
            message: `No image acquired for source item ${createdItem.id}: ${acquisition.reason}`,
            context: { sourceItemId: createdItem.id, sourceUrl: createdItem.sourceUrl },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logSystemEvent({
          level: "WARN",
          source: "images.acquire",
          message: `Image acquisition threw unexpectedly for source item ${createdItem.id}: ${message}`,
          context: { sourceItemId: createdItem.id, sourceUrl: createdItem.sourceUrl },
        });
      }

      const clusterBefore = await prisma.storyCluster.findUniqueOrThrow({
        where: { id: clusterId },
        select: { importance: true, pakistanRelevance: true },
      });
      await prisma.storyCluster.update({
        where: { id: clusterId },
        data: {
          importance: Math.max(priority.score, clusterBefore.importance),
          pakistanRelevance: Math.max(relevanceScoreToPercent(relevance.score), clusterBefore.pakistanRelevance),
          pakistanImpactLevel: relevance.level === "NONE" ? undefined : relevance.level,
        },
      });

      created++;
    }

    await prisma.source.update({
      where: { id: sourceId },
      data: { lastChecked: new Date(), lastSuccess: new Date(), lastError: items.length === 0 ? "Feed parsed but contained no usable items." : null },
    });

    await logAction({
      userId: requestedById,
      action: "source_fetched",
      entityType: "Source",
      entityId: sourceId,
      metadata: { itemsSeen: items.length, itemsCreated: created, itemsSkippedExisting: skippedExisting },
    });

    return { ok: true, itemsSeen: items.length, itemsCreated: created, itemsSkippedExisting: skippedExisting };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordError(message);
    return { ok: false, itemsSeen: 0, itemsCreated: 0, itemsSkippedExisting: 0, error: message };
  }
}
