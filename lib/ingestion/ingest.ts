import "server-only";
import { prisma } from "../prisma";
import { safeFetch } from "../security/safe-fetch";
import { isFetchAllowed } from "./robots";
import { parseFeed, type ParsedFeedItem } from "./feed-parser";
import { normalizeTitle } from "./normalize";
import { findBestDuplicateMatch, AUTO_MERGE_THRESHOLD, type DuplicateCandidate } from "../discovery/duplicates";
import { classifyPakistanRelevance, relevanceScoreToPercent } from "../discovery/pakistan-relevance";
import { classifyTechRelevance } from "../discovery/tech-relevance";
import { computePriorityScore } from "../discovery/priority";
import { logAction } from "../audit";
import { logSystemEvent } from "../monitoring";
import type { Prisma, Source } from "@prisma/client";

const RECENT_CANDIDATE_WINDOW_DAYS = 14;
const RECENT_CANDIDATE_LIMIT = 300;

export interface IngestResult {
  ok: boolean;
  itemsSeen: number;
  itemsCreated: number;
  itemsSkippedExisting: number;
  /** Created, but scored zero technology-relevance signal — deprioritized
   * (see lib/discovery/priority.ts), never dropped; still a normal
   * SourceItem an editor can find and promote in /admin/discovery. */
  itemsDeprioritizedNonTech: number;
  error?: string;
}

function emptyResult(error?: string): IngestResult {
  return {
    ok: false,
    itemsSeen: 0,
    itemsCreated: 0,
    itemsSkippedExisting: 0,
    itemsDeprioritizedNonTech: 0,
    error,
  };
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

export interface ProcessedItemsStats {
  created: number;
  skippedExisting: number;
  deprioritizedNonTech: number;
}

/**
 * The per-item core shared by every ingestion path (RSS/Atom via
 * ingestSource below, Google News via lib/ingestion/google-news.ts's
 * ingestGoogleNewsSource): dedup/clustering against recent candidates,
 * Pakistan-relevance and tech-relevance scoring, priority scoring, the
 * SourceItem write, and automated image acquisition. Kept as one function
 * so these two ingestion paths can never drift apart on this logic —
 * whichever feed format an item came from, it goes through identical
 * classification once parsed into a ParsedFeedItem.
 */
export async function processIngestedItems(source: Source, items: ParsedFeedItem[]): Promise<ProcessedItemsStats> {
  const sourceId = source.id;
  const [activeKeywords, priorityKeywords, topicKeywords] = await Promise.all([
    prisma.keyword.findMany({ where: { active: true, type: { in: ["PAKISTAN", "COMPANY"] } } }),
    prisma.keyword.findMany({ where: { active: true, priority: true } }),
    prisma.keyword.findMany({ where: { active: true, type: "TOPIC" } }),
  ]);
  const candidates = await getRecentCandidates();

  let created = 0;
  let skippedExisting = 0;
  let deprioritizedNonTech = 0;

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
    const techRelevance = classifyTechRelevance(text, topicKeywords);
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
      techRelevance,
    });
    if (techRelevance.score === 0) deprioritizedNonTech++;

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

    // Images are deliberately NOT acquired here. Doing so ran acquisition
    // for every ingested item (~1,900/day) when only a handful ever become
    // articles — 1,975 of 1,999 stored images were attached to no article,
    // which is what exhausted the blob store's quota and broke every image
    // on the site. Acquisition now runs lazily, in featuredImageFieldsFor,
    // at the moment an item actually becomes an article.

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

  return { created, skippedExisting, deprioritizedNonTech };
}

/**
 * Fetches and ingests one source's feed. Never throws to the caller — every
 * failure mode (robots disallow, network/timeout, malformed feed, DB error)
 * is caught, recorded on Source.lastError, and returned as a normal result
 * so a batch of sources can never be aborted by one bad feed.
 */
export async function ingestSource(sourceId: string, requestedById: string): Promise<IngestResult> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) return emptyResult("Source not found.");
  if (!source.active) return emptyResult("Source is disabled.");
  if (!source.feedUrl) return emptyResult("Source has no feed URL configured.");

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
      return emptyResult("Blocked by robots.txt.");
    }

    const response = await safeFetch(source.feedUrl);
    if (response.status !== 200) {
      await recordError(`Feed returned HTTP ${response.status}.`);
      return emptyResult(`HTTP ${response.status}`);
    }

    const items = parseFeed(response.text);
    if (items.length === 0) {
      await recordError("Feed parsed but contained no usable items (empty or malformed).");
      // Not necessarily a hard failure — some feeds are legitimately empty —
      // but worth surfacing, so lastError is still set while lastSuccess
      // still updates below.
    }

    const stats = await processIngestedItems(source, items);

    await prisma.source.update({
      where: { id: sourceId },
      data: { lastChecked: new Date(), lastSuccess: new Date(), lastError: items.length === 0 ? "Feed parsed but contained no usable items." : null },
    });

    await logAction({
      userId: requestedById,
      action: "source_fetched",
      entityType: "Source",
      entityId: sourceId,
      metadata: { itemsSeen: items.length, itemsCreated: stats.created, itemsSkippedExisting: stats.skippedExisting },
    });

    return {
      ok: true,
      itemsSeen: items.length,
      itemsCreated: stats.created,
      itemsSkippedExisting: stats.skippedExisting,
      itemsDeprioritizedNonTech: stats.deprioritizedNonTech,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordError(message);
    return emptyResult(message);
  }
}
