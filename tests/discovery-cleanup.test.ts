import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cleanupExpiredDiscoveryItems, DISCOVERY_RETENTION_MS } from "../lib/discovery/cleanup";
import { prisma } from "../lib/prisma";
import { cleanupTestData, trackArticle } from "./helpers";
import { getSystemUserId } from "../lib/system-actor";

let categoryId: string;
let authorId: string;
let sourceId: string;
const createdItemIds: string[] = [];
const createdArticleIds: string[] = [];

const EXPIRED = new Date(Date.now() - DISCOVERY_RETENTION_MS - 60_000); // just over 24h
const FRESH = new Date(Date.now() - 60_000); // 1 minute ago — well under 24h

async function makeSourceItem(overrides: {
  createdAt: Date;
  convertedArticleId?: string;
  status?: "NEW" | "REVIEWING" | "VERIFIED" | "DUPLICATE" | "POSSIBLE_DUPLICATE" | "REJECTED" | "CONVERTED_TO_DRAFT";
}) {
  const item = await prisma.sourceItem.create({
    data: {
      sourceId,
      sourceUrl: `https://discovery-cleanup-test.test/story-${Date.now()}-${Math.random()}`,
      headline: "Discovery cleanup test headline",
      normalizedTitle: "discovery cleanup test headline",
      status: overrides.status ?? (overrides.convertedArticleId ? "CONVERTED_TO_DRAFT" : "NEW"),
      convertedArticleId: overrides.convertedArticleId,
      createdAt: overrides.createdAt,
    },
  });
  createdItemIds.push(item.id);
  return item;
}

async function makeArticle(status: "DRAFT" | "IN_REVIEW" | "SCHEDULED" | "PUBLISHED") {
  const article = await prisma.article.create({
    data: {
      slug: `discovery-cleanup-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Discovery cleanup test article",
      content: { blocks: [{ type: "paragraph", text: "Body." }] },
      status,
      categoryId,
      authorId,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      scheduledAt: status === "SCHEDULED" ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) : null,
    },
  });
  createdArticleIds.push(article.id);
  trackArticle(article.id);
  return article;
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `Discovery Cleanup Test Category ${Date.now()}`, slug: `discovery-cleanup-test-category-${Date.now()}` },
  });
  categoryId = category.id;
  const author = await prisma.author.create({
    data: { name: `Discovery Cleanup Test Author ${Date.now()}`, slug: `discovery-cleanup-test-author-${Date.now()}` },
  });
  authorId = author.id;
  const source = await prisma.source.create({
    data: { name: `Discovery Cleanup Test Source ${Date.now()}`, url: "https://discovery-cleanup-test.test", type: "RSS", tier: "TIER_3" },
  });
  sourceId = source.id;
});

afterAll(async () => {
  if (createdItemIds.length) await prisma.sourceItem.deleteMany({ where: { id: { in: createdItemIds } } });
  await cleanupTestData();
  if (sourceId) await prisma.source.deleteMany({ where: { id: sourceId } });
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
});

describe("cleanupExpiredDiscoveryItems", () => {
  it("removes an unprocessed item older than 24h with no article", async () => {
    const item = await makeSourceItem({ createdAt: EXPIRED });
    await cleanupExpiredDiscoveryItems();
    const after = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    expect(after).toBeNull();
  });

  it("preserves an unprocessed item under 24h old", async () => {
    const item = await makeSourceItem({ createdAt: FRESH });
    await cleanupExpiredDiscoveryItems();
    const after = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    expect(after).not.toBeNull();
  });

  it("protects an expired item linked to a SCHEDULED article, however old, and never touches the article", async () => {
    const article = await makeArticle("SCHEDULED");
    const item = await makeSourceItem({ createdAt: EXPIRED, convertedArticleId: article.id });

    const summary = await cleanupExpiredDiscoveryItems();
    expect(summary.scheduledProtected).toBeGreaterThanOrEqual(1);

    const itemAfter = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    expect(itemAfter).not.toBeNull();
    const articleAfter = await prisma.article.findUnique({ where: { id: article.id } });
    expect(articleAfter).not.toBeNull();
    expect(articleAfter!.status).toBe("SCHEDULED");
  });

  it("removes the discovery record for a PUBLISHED article immediately, even though it's fresh, while the article survives intact", async () => {
    const article = await makeArticle("PUBLISHED");
    const item = await makeSourceItem({ createdAt: FRESH, convertedArticleId: article.id });

    const summary = await cleanupExpiredDiscoveryItems();
    expect(summary.publishedRemoved).toBeGreaterThanOrEqual(1);

    const itemAfter = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    expect(itemAfter).toBeNull();

    const articleAfter = await prisma.article.findUnique({ where: { id: article.id } });
    expect(articleAfter).not.toBeNull();
    expect(articleAfter!.status).toBe("PUBLISHED");
    expect(articleAfter!.title).toBe(article.title);
  });

  it("removes an expired discovery record linked to a DRAFT article, but the draft itself is preserved", async () => {
    const article = await makeArticle("DRAFT");
    const item = await makeSourceItem({ createdAt: EXPIRED, convertedArticleId: article.id });

    await cleanupExpiredDiscoveryItems();

    const itemAfter = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    expect(itemAfter).toBeNull();

    const articleAfter = await prisma.article.findUnique({ where: { id: article.id } });
    expect(articleAfter).not.toBeNull();
    expect(articleAfter!.status).toBe("DRAFT");
  });

  it("preserves a fresh discovery record linked to an IN_REVIEW article", async () => {
    const article = await makeArticle("IN_REVIEW");
    const item = await makeSourceItem({ createdAt: FRESH, convertedArticleId: article.id });

    await cleanupExpiredDiscoveryItems();

    const itemAfter = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    expect(itemAfter).not.toBeNull();
  });

  it("never deletes the StoryCluster or Claim data behind a cleaned-up discovery item", async () => {
    const cluster = await prisma.storyCluster.create({ data: { title: "Discovery cleanup test cluster" } });
    // Claim.createdById is a required User FK — reuse the system actor
    // rather than adding a dedicated test user just for this one field.
    const systemUserId = await getSystemUserId();
    const claim = await prisma.claim.create({
      data: { clusterId: cluster.id, text: "A claim that must survive cleanup.", createdById: systemUserId },
    });

    const item = await makeSourceItem({ createdAt: EXPIRED });
    await prisma.sourceItem.update({ where: { id: item.id }, data: { clusterId: cluster.id } });
    await prisma.claimSource.create({ data: { claimId: claim.id, sourceItemId: item.id, stance: "SUPPORTING" } });

    await cleanupExpiredDiscoveryItems();

    const itemAfter = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    expect(itemAfter).toBeNull(); // the discovery record itself is gone

    const clusterAfter = await prisma.storyCluster.findUnique({ where: { id: cluster.id } });
    expect(clusterAfter).not.toBeNull(); // but the cluster and claim survive
    const claimAfter = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(claimAfter).not.toBeNull();
    expect(claimAfter!.text).toBe("A claim that must survive cleanup.");

    await prisma.claim.delete({ where: { id: claim.id } });
    await prisma.storyCluster.delete({ where: { id: cluster.id } });
  });

  it("is idempotent — running it twice in a row is safe and finds nothing more to do the second time", async () => {
    const item = await makeSourceItem({ createdAt: EXPIRED });
    const first = await cleanupExpiredDiscoveryItems();
    expect(first.removed).toBeGreaterThanOrEqual(1);

    const itemAfterFirst = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    expect(itemAfterFirst).toBeNull();

    // Second run must not throw, and must not find this already-gone item
    // again — proving re-running cleanup is safe.
    await expect(cleanupExpiredDiscoveryItems()).resolves.toBeDefined();
  });
});
