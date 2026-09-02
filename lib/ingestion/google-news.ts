import "server-only";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "../prisma";
import { safeFetch } from "../security/safe-fetch";
import { parseFeed, type ParsedFeedItem } from "./feed-parser";
import { processIngestedItems } from "./ingest";
import { logAction } from "../audit";
import type { IngestResult } from "./ingest";

const GOOGLE_NEWS_BASE_URL = "https://news.google.com/rss/search";

/**
 * A category's Google News query is its active TOPIC-type Keyword rows
 * scoped to that category (Keyword.categoryId), OR-joined and quoted (e.g.
 * `"OpenAI" OR "Google Gemini" OR "Anthropic"`). Returns null — never an
 * empty-string query — when the category has no query-scoped keywords yet,
 * so callers can no-op cleanly instead of sending Google an empty search.
 */
export async function buildGoogleNewsQuery(categoryId: string): Promise<string | null> {
  const keywords = await prisma.keyword.findMany({
    where: { categoryId, active: true, type: "TOPIC" },
    select: { term: true },
    orderBy: { term: "asc" },
  });
  if (keywords.length === 0) return null;
  return keywords.map((k) => `"${k.term.replace(/"/g, "")}"`).join(" OR ");
}

/** Pure URL construction — defaults match TEKZARO's Pakistan-first editorial
 * focus (en-PK/PK), same as every other Pakistan-relevance default in this
 * codebase (see lib/discovery/pakistan-relevance.ts). */
export function buildGoogleNewsSearchUrl(query: string, opts?: { lang?: string; country?: string }): string {
  const lang = opts?.lang ?? "en-PK";
  const country = opts?.country ?? "PK";
  const languageCode = lang.split("-")[0];
  const params = new URLSearchParams({ q: query, hl: lang, gl: country, ceid: `${country}:${languageCode}` });
  return `${GOOGLE_NEWS_BASE_URL}?${params.toString()}`;
}

export interface GoogleNewsFeedItem extends ParsedFeedItem {
  sourcePublisherName?: string;
  sourcePublisherUrl?: string;
}

// Separate parser instance, same config as lib/ingestion/feed-parser.ts's
// (also XXE-immune by construction — fast-xml-parser never processes
// DOCTYPE/ENTITY declarations) — used only for the second, best-effort pass
// below that recovers Google's non-standard per-item <source> tag.
const sourceTagParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Thin sibling of parseFeed() — Google News' RSS is standard-enough RSS 2.0
 * that parseFeed() already extracts title/link/pubDate/excerpt correctly
 * (and is just as tolerant of malformed items); this only adds the one
 * non-standard per-item <source url="...">Publisher Name</source> tag
 * Google includes that parseFeed doesn't read, matched back to each parsed
 * item by document order (both passes iterate the same <item> list in the
 * same order). Falls back to the unenriched base items whenever that
 * pairing can't be trusted, rather than risk attributing the wrong
 * publisher to the wrong item.
 */
export function parseGoogleNewsFeed(xml: string): GoogleNewsFeedItem[] {
  const baseItems = parseFeed(xml);
  if (baseItems.length === 0) return baseItems;

  let rawItems: Record<string, unknown>[];
  try {
    const doc = sourceTagParser.parse(xml) as Record<string, unknown>;
    const channel = (doc.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
    rawItems = asArray(channel?.item as Record<string, unknown> | Record<string, unknown>[] | undefined);
  } catch {
    return baseItems;
  }

  if (rawItems.length !== baseItems.length) return baseItems;

  return baseItems.map((item, i) => {
    const source = rawItems[i]?.source as { "@_url"?: string; "#text"?: string } | string | undefined;
    if (!source || typeof source === "string") return item;
    return {
      ...item,
      sourcePublisherUrl: source["@_url"],
      sourcePublisherName: source["#text"],
    };
  });
}

/**
 * Fetches and ingests one GOOGLE_NEWS-type Source. Mirrors ingestSource()
 * (lib/ingestion/ingest.ts) in every way except: the query is computed live
 * from the category's TOPIC keywords rather than a stored feedUrl, and
 * robots.txt is deliberately NOT checked — news.google.com/robots.txt
 * disallows /rss/ for generic bots, which would make this source type
 * permanently non-functional; fetching Google's own documented RSS search
 * endpoint (the same one countless RSS readers and services consume) is a
 * deliberate, explicitly-approved exception to the robots.txt check every
 * other source type in this codebase honors. Never throws to the caller —
 * same never-throws contract as ingestSource.
 */
export async function ingestGoogleNewsSource(sourceId: string, requestedById: string): Promise<IngestResult> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  const emptyResult = (error?: string): IngestResult => ({
    ok: false,
    itemsSeen: 0,
    itemsCreated: 0,
    itemsSkippedExisting: 0,
    itemsDeprioritizedNonTech: 0,
    imagesAcquired: 0,
    imagesNeedingReview: 0,
    imagesFailed: 0,
    error,
  });

  if (!source) return emptyResult("Source not found.");
  if (!source.active) return emptyResult("Source is disabled.");
  if (source.type !== "GOOGLE_NEWS") return emptyResult("Source is not a Google News source.");
  if (!source.categoryId) return emptyResult("Google News source has no category assigned.");

  const recordError = async (message: string) => {
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastChecked: new Date(), lastError: message.slice(0, 500) },
    });
  };

  try {
    const query = await buildGoogleNewsQuery(source.categoryId);
    if (!query) {
      await recordError("No active TOPIC-type keywords are assigned to this source's category yet.");
      return emptyResult("No query-scoped keywords configured.");
    }

    const url = buildGoogleNewsSearchUrl(query);
    const response = await safeFetch(url);
    if (response.status !== 200) {
      await recordError(`Feed returned HTTP ${response.status}.`);
      return emptyResult(`HTTP ${response.status}`);
    }

    const items = parseGoogleNewsFeed(response.text);
    if (items.length === 0) {
      await recordError("Feed parsed but contained no usable items (empty or malformed).");
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
      metadata: { itemsSeen: items.length, itemsCreated: stats.created, itemsSkippedExisting: stats.skippedExisting, googleNewsQuery: query },
    });

    return {
      ok: true,
      itemsSeen: items.length,
      itemsCreated: stats.created,
      itemsSkippedExisting: stats.skippedExisting,
      itemsDeprioritizedNonTech: stats.deprioritizedNonTech,
      imagesAcquired: stats.imagesAcquired,
      imagesNeedingReview: stats.imagesNeedingReview,
      imagesFailed: stats.imagesFailed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordError(message);
    return emptyResult(message);
  }
}
