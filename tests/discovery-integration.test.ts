import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { ForbiddenError } from "../lib/auth";
import { createSourceAction, setSourceActiveAction } from "../lib/source-actions";
import { researchItemAction, createDraftFromItemAction } from "../lib/discovery-actions";
import {
  hasUnresolvedContradiction,
  createClaimAction,
  addClaimSourceAction,
  resolveClaimAction,
  createDraftFromClusterAction,
} from "../lib/cluster-actions";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } from "./helpers";
import { getSystemUserId } from "../lib/system-actor";

let categoryId: string;
let authorId: string;
const createdSourceIds: string[] = [];
const createdClusterIds: string[] = [];
const createdArticleIds: string[] = [];

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow()).id;
  authorId = (await prisma.author.findFirstOrThrow()).id;
});

afterAll(async () => {
  clearSession();
  if (createdArticleIds.length) await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
  if (createdClusterIds.length) await prisma.storyCluster.deleteMany({ where: { id: { in: createdClusterIds } } });
  if (createdSourceIds.length) await prisma.source.deleteMany({ where: { id: { in: createdSourceIds } } });
  await cleanupTestData();
});

async function makeSourceAndCluster() {
  const source = await prisma.source.create({
    data: { name: `Test Source ${Date.now()}`, url: "https://example.com", type: "RSS", tier: "TIER_2" },
  });
  createdSourceIds.push(source.id);
  const cluster = await prisma.storyCluster.create({ data: { title: "Test cluster" } });
  createdClusterIds.push(cluster.id);
  const itemA = await prisma.sourceItem.create({
    data: {
      sourceId: source.id,
      sourceUrl: `https://example.com/a-${Date.now()}`,
      headline: "Item A",
      normalizedTitle: "item a",
      clusterId: cluster.id,
      categoryId,
    },
  });
  const itemB = await prisma.sourceItem.create({
    data: {
      sourceId: source.id,
      sourceUrl: `https://example.com/b-${Date.now()}`,
      headline: "Item B",
      normalizedTitle: "item b",
      clusterId: cluster.id,
      categoryId,
    },
  });
  return { source, cluster, itemA, itemB };
}

describe("claim contradiction blocking", () => {
  it("blocks draft creation once a claim has both a supporting and contradicting source, until explicitly resolved", async () => {
    const editor = await createTestUser("EDITOR", "claims");
    trackUser(editor.id);
    await loginAs(editor.id);

    const { cluster, itemA, itemB } = await makeSourceAndCluster();

    expect(await hasUnresolvedContradiction(cluster.id)).toBe(false);

    const formData1 = new FormData();
    formData1.set("text", "The deal is worth $5 billion");
    formData1.set("type", "CLAIM");
    await expect(createClaimAction(cluster.id, formData1)).rejects.toThrow(/NEXT_REDIRECT/);

    const claim = await prisma.claim.findFirstOrThrow({ where: { clusterId: cluster.id } });
    expect(claim.resolved).toBe(true); // no contradiction yet

    const supportForm = new FormData();
    supportForm.set("sourceItemId", itemA.id);
    supportForm.set("stance", "SUPPORTING");
    await expect(addClaimSourceAction(cluster.id, claim.id, supportForm)).rejects.toThrow(/NEXT_REDIRECT/);

    let stillOk = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(stillOk.resolved).toBe(true); // only one stance so far — not a contradiction

    const contradictForm = new FormData();
    contradictForm.set("sourceItemId", itemB.id);
    contradictForm.set("stance", "CONTRADICTING");
    await expect(addClaimSourceAction(cluster.id, claim.id, contradictForm)).rejects.toThrow(/NEXT_REDIRECT/);

    expect(await hasUnresolvedContradiction(cluster.id)).toBe(true);

    const draftAttempt = await createDraftFromClusterAction(cluster.id);
    expect(draftAttempt.ok).toBe(false);
    expect(draftAttempt.error).toMatch(/unresolved contradiction/i);

    const resolveForm = new FormData();
    resolveForm.set("resolutionNote", "Confirmed $5 billion via official filing.");
    await expect(resolveClaimAction(cluster.id, claim.id, resolveForm)).rejects.toThrow(/NEXT_REDIRECT/);

    expect(await hasUnresolvedContradiction(cluster.id)).toBe(false);

    const draftAfterResolution = await createDraftFromClusterAction(cluster.id);
    expect(draftAfterResolution.ok).toBe(true);
    if (draftAfterResolution.articleId) createdArticleIds.push(draftAfterResolution.articleId);

    clearSession();
  });
});

describe("createDraftFromItemAction — Non-negotiable invariant on the acquired image", () => {
  it("leaves featuredImageUrl null (but still links featuredMediaId) when the acquired image isn't cleared for use", async () => {
    const researcher = await createTestUser("RESEARCHER", "draft-image-review");
    trackUser(researcher.id);
    await loginAs(researcher.id);

    const { itemA } = await makeSourceAndCluster();
    const media = await prisma.media.create({
      data: {
        url: "https://blob.example/unreviewed.jpg",
        altText: "Unreviewed",
        filename: "unreviewed.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        uploadedById: await getSystemUserId(),
        sourceItemId: itemA.id,
        reuseStatus: "REQUIRES_REVIEW",
      },
    });

    const draft = await createDraftFromItemAction(itemA.id);
    expect(draft.ok).toBe(true);
    if (draft.articleId) createdArticleIds.push(draft.articleId);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: draft.articleId! } });
    expect(article.featuredMediaId).toBe(media.id);
    expect(article.featuredImageUrl).toBeNull();

    await prisma.media.delete({ where: { id: media.id } });
    clearSession();
  });

  it("populates featuredImageUrl when the acquired image is cleared for use", async () => {
    const researcher = await createTestUser("RESEARCHER", "draft-image-allowed");
    trackUser(researcher.id);
    await loginAs(researcher.id);

    const { itemA } = await makeSourceAndCluster();
    const media = await prisma.media.create({
      data: {
        url: "https://blob.example/cleared.jpg",
        altText: "Cleared for use",
        filename: "cleared.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        uploadedById: await getSystemUserId(),
        sourceItemId: itemA.id,
        reuseStatus: "ALLOWED",
      },
    });

    const draft = await createDraftFromItemAction(itemA.id);
    expect(draft.ok).toBe(true);
    if (draft.articleId) createdArticleIds.push(draft.articleId);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: draft.articleId! } });
    expect(article.featuredMediaId).toBe(media.id);
    expect(article.featuredImageUrl).toBe(media.url);
    expect(article.featuredImageAlt).toBe(media.altText);

    await prisma.media.delete({ where: { id: media.id } });
    clearSession();
  });
});

describe("createDraftFromItemAction — no eligible author", () => {
  const createdCategoryIds: string[] = [];
  let deactivatedGeneralistIds: string[] = [];

  afterAll(async () => {
    if (deactivatedGeneralistIds.length) {
      await prisma.author.updateMany({ where: { id: { in: deactivatedGeneralistIds } }, data: { active: true } });
    }
    if (createdCategoryIds.length) await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  });

  it("returns a clear error and creates no article when no active author is eligible for the item's category", async () => {
    const editor = await createTestUser("EDITOR", "no-eligible-author");
    trackUser(editor.id);
    await loginAs(editor.id);

    const freshCategory = await prisma.category.create({
      data: { name: `No Eligible Author Cat ${Date.now()}`, slug: `no-eligible-author-cat-${Date.now()}-${Math.random()}` },
    });
    createdCategoryIds.push(freshCategory.id);

    // Brand new category — no author's explicit list could include it yet,
    // so eligibility reduces to "is any active author a generalist". Set
    // every current generalist aside for this one assertion.
    const activeGeneralists = await prisma.author.findMany({
      where: { active: true, categories: { none: {} } },
      select: { id: true },
    });
    deactivatedGeneralistIds = activeGeneralists.map((a) => a.id);
    if (deactivatedGeneralistIds.length) {
      await prisma.author.updateMany({ where: { id: { in: deactivatedGeneralistIds } }, data: { active: false } });
    }

    try {
      const source = await prisma.source.create({
        data: { name: `No Eligible Author Source ${Date.now()}`, url: "https://example.com", type: "RSS", tier: "TIER_2" },
      });
      createdSourceIds.push(source.id);
      const item = await prisma.sourceItem.create({
        data: {
          sourceId: source.id,
          sourceUrl: `https://example.com/no-author-${Date.now()}`,
          headline: "No eligible author item",
          normalizedTitle: "no eligible author item",
          categoryId: freshCategory.id,
        },
      });

      const result = await createDraftFromItemAction(item.id);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/no active author is eligible/i);
      expect(result.articleId).toBeUndefined();

      const unchanged = await prisma.sourceItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(unchanged.status).toBe("NEW");
    } finally {
      if (deactivatedGeneralistIds.length) {
        await prisma.author.updateMany({ where: { id: { in: deactivatedGeneralistIds } }, data: { active: true } });
        deactivatedGeneralistIds = [];
      }
      clearSession();
    }
  });
});

describe("unauthorized discovery/source actions", () => {
  it("rejects a REPORTER managing sources", async () => {
    const reporter = await createTestUser("REPORTER", "sources-unauth");
    trackUser(reporter.id);
    await loginAs(reporter.id);

    const form = new FormData();
    form.set("name", "Should not be created");
    form.set("url", "https://example.com");
    form.set("type", "RSS");
    form.set("tier", "TIER_3");
    await expect(createSourceAction(form)).rejects.toThrow(ForbiddenError);
    clearSession();
  });

  it("rejects a RESEARCHER disabling a source (research access does not imply source management)", async () => {
    const researcher = await createTestUser("RESEARCHER", "sources-unauth2");
    trackUser(researcher.id);
    await loginAs(researcher.id);

    const { source } = await makeSourceAndCluster();
    await expect(setSourceActiveAction(source.id, false)).rejects.toThrow(ForbiddenError);
    clearSession();
  });

  it("lets a RESEARCHER research a discovery item and create a draft, matching 'creates draft material, cannot publish'", async () => {
    const researcher = await createTestUser("RESEARCHER", "research-ok");
    trackUser(researcher.id);
    await loginAs(researcher.id);

    const { itemA } = await makeSourceAndCluster();
    await expect(researchItemAction(itemA.id)).rejects.toThrow(/NEXT_REDIRECT/);
    const reviewed = await prisma.sourceItem.findUniqueOrThrow({ where: { id: itemA.id } });
    expect(reviewed.status).toBe("REVIEWING");

    const draft = await createDraftFromItemAction(itemA.id);
    expect(draft.ok).toBe(true);
    if (draft.articleId) createdArticleIds.push(draft.articleId);
    clearSession();
  });

  it("rejects an unauthenticated call to any of these actions", async () => {
    clearSession();
    await expect(setSourceActiveAction("does-not-matter", true)).rejects.toThrow(ForbiddenError);
  });
});
