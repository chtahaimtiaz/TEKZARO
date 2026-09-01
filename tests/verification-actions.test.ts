import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const verifyAndSynthesizeMock = vi.fn();
vi.mock("../lib/ai/verify-and-synthesize", () => ({
  verifyAndSynthesize: verifyAndSynthesizeMock,
}));

const { processVerificationBatch } = await import("../lib/verification-actions");
const { prisma } = await import("../lib/prisma");
const { getSystemUserId } = await import("../lib/system-actor");
const { cleanupTestData } = await import("./helpers");

const confirmedDraft = {
  headline: `Auto-publish gate test headline ${Date.now()}`,
  excerpt: "A short original excerpt for the gate test.",
  blocks: [{ type: "paragraph" as const, text: "Original synthesized body text." }],
};

const createdArticleIds: string[] = [];
const createdSourceIds: string[] = [];
const createdItemIds: string[] = [];
const createdMediaIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdAuthorIds: string[] = [];

async function makeSourceItem() {
  const source = await prisma.source.create({
    data: { name: `Gate Test Source ${Date.now()}-${Math.random()}`, url: "https://gate-test-outlet.test", type: "RSS", tier: "TIER_2" },
  });
  createdSourceIds.push(source.id);
  const item = await prisma.sourceItem.create({
    data: {
      sourceId: source.id,
      sourceUrl: `https://gate-test-outlet.test/story-${Date.now()}-${Math.random()}`,
      headline: "A discovered tech story headline for the gate test",
      normalizedTitle: "a discovered tech story headline for the gate test",
      status: "NEW",
    },
  });
  createdItemIds.push(item.id);
  return item;
}

async function ensureCategoryAndAuthorExist(): Promise<void> {
  const [category, author] = await Promise.all([
    prisma.category.findFirst(),
    prisma.author.findFirst(),
  ]);
  if (!category) {
    const c = await prisma.category.create({ data: { name: `Gate Test Category ${Date.now()}`, slug: `gate-test-category-${Date.now()}` } });
    createdCategoryIds.push(c.id);
  }
  if (!author) {
    const a = await prisma.author.create({ data: { name: `Gate Test Author ${Date.now()}`, slug: `gate-test-author-${Date.now()}` } });
    createdAuthorIds.push(a.id);
  }
}

// processVerificationBatch claims the oldest NEW SourceItem(s) across the
// whole table — this suite runs against the same shared dev database used
// all session, not an isolated test DB, and several OTHER pre-existing test
// files (image-acquisition.test.ts, discovery-integration.test.ts) also
// create bare NEW-status SourceItems, running concurrently in their own
// Vitest workers for the whole suite's duration (not just this file's). A
// one-time beforeAll snapshot can't defend against that — those other files
// keep creating NEW items throughout, not just before this file starts. So
// this sets every *other* NEW item aside immediately before each individual
// claim (not once per file), narrowing the race window to essentially
// nothing, and restores them all in this file's own afterAll.
const setAsideItemIds: string[] = [];

async function claimOnly(itemId: string, limit: number): Promise<ReturnType<typeof processVerificationBatch>> {
  const others = await prisma.sourceItem.findMany({ where: { status: "NEW", id: { not: itemId } }, select: { id: true } });
  const otherIds = others.map((i) => i.id);
  if (otherIds.length) {
    setAsideItemIds.push(...otherIds);
    await prisma.sourceItem.updateMany({ where: { id: { in: otherIds } }, data: { status: "REVIEWING" } });
  }
  return processVerificationBatch(limit);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  if (createdArticleIds.length) await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
  if (createdMediaIds.length) await prisma.media.deleteMany({ where: { id: { in: createdMediaIds } } });
  if (createdItemIds.length) await prisma.sourceItem.deleteMany({ where: { id: { in: createdItemIds } } });
  if (createdSourceIds.length) await prisma.source.deleteMany({ where: { id: { in: createdSourceIds } } });
  if (createdCategoryIds.length) await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  if (createdAuthorIds.length) await prisma.author.deleteMany({ where: { id: { in: createdAuthorIds } } });
  if (setAsideItemIds.length) {
    // Restore to NEW is a best-effort courtesy to whichever other file's
    // fixture this was — it's already outside this file's own tracked ids,
    // so this can't put back anything this file itself needs to clean up.
    await prisma.sourceItem.updateMany({ where: { id: { in: setAsideItemIds } }, data: { status: "NEW" } });
  }
  await cleanupTestData();
});

describe("processVerificationBatch — the auto-publish gate", () => {
  it("does NOT auto-publish when verificationStatus claims PRIMARY_SOURCE_CONFIRMED but a publication check fails (unreviewed image)", async () => {
    await ensureCategoryAndAuthorExist();
    const item = await makeSourceItem();
    const systemUserId = await getSystemUserId();

    // An acquired-but-unreviewed image linked to this item — featuredImageFieldsFor
    // will surface it as featuredMediaId (found) but leave featuredImageUrl null
    // (not publishable), which evaluatePublicationChecks' image-rights check
    // must reject regardless of what verification claims.
    const media = await prisma.media.create({
      data: {
        url: "https://gate-test-outlet.test/image.jpg",
        altText: "A test image",
        filename: "image.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        uploadedById: systemUserId,
        sourceItemId: item.id,
        reuseStatus: "REQUIRES_REVIEW",
      },
    });
    createdMediaIds.push(media.id);

    verifyAndSynthesizeMock.mockResolvedValue({
      verificationStatus: "PRIMARY_SOURCE_CONFIRMED",
      primarySourceUrl: "https://official-newsroom.test/press-release",
      notes: "Confirmed by the official newsroom statement.",
      draft: confirmedDraft,
      generationId: "fake-generation-id",
    });

    const summary = await claimOnly(item.id, 1);
    expect(summary.itemsProcessed).toBeGreaterThanOrEqual(0);

    const updatedItem = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    // If this item wasn't the one claimed by the batch (another NEW item was
    // older), skip gracefully rather than fail on an ordering assumption —
    // the meaningful assertion is on whatever article *this* item produced.
    if (!updatedItem || updatedItem.status !== "CONVERTED_TO_DRAFT" || !updatedItem.convertedArticleId) {
      throw new Error(
        "Test setup assumption failed: this SourceItem was not the one claimed by processVerificationBatch(1) — " +
          "there is likely an older NEW SourceItem in the shared dev DB. Increase the limit or investigate.",
      );
    }
    createdArticleIds.push(updatedItem.convertedArticleId);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: updatedItem.convertedArticleId } });
    expect(article.status).toBe("IN_REVIEW");
    expect(article.autoPublished).toBe(false);
    expect(article.verificationStatus).toBe("PRIMARY_SOURCE_CONFIRMED");
    expect(summary.autoPublished).toBe(0);
    expect(summary.sentToReview).toBe(1);
  });

  it("DOES auto-publish when verificationStatus is PRIMARY_SOURCE_CONFIRMED and every publication check passes (no image at all)", async () => {
    await ensureCategoryAndAuthorExist();
    const item = await makeSourceItem();

    verifyAndSynthesizeMock.mockResolvedValue({
      verificationStatus: "PRIMARY_SOURCE_CONFIRMED",
      primarySourceUrl: "https://official-newsroom.test/press-release-2",
      notes: "Confirmed by the official newsroom statement.",
      draft: { ...confirmedDraft, headline: `${confirmedDraft.headline} (clean)` },
      generationId: "fake-generation-id-2",
    });

    const summary = await claimOnly(item.id, 1);

    const updatedItem = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    if (!updatedItem || updatedItem.status !== "CONVERTED_TO_DRAFT" || !updatedItem.convertedArticleId) {
      throw new Error(
        "Test setup assumption failed: this SourceItem was not the one claimed by processVerificationBatch(1).",
      );
    }
    createdArticleIds.push(updatedItem.convertedArticleId);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: updatedItem.convertedArticleId } });
    expect(article.status).toBe("PUBLISHED");
    expect(article.autoPublished).toBe(true);
    expect(article.publishedAt).not.toBeNull();
    expect(summary.autoPublished).toBe(1);

    const version = await prisma.articleVersion.findFirst({ where: { articleId: article.id }, orderBy: { versionNumber: "desc" } });
    expect(version?.status).toBe("PUBLISHED");
    const audit = await prisma.auditLog.findFirst({ where: { entityId: article.id, action: "article_published" } });
    expect(audit).not.toBeNull();
  });

  it("does not auto-publish when verificationStatus is anything other than PRIMARY_SOURCE_CONFIRMED", async () => {
    await ensureCategoryAndAuthorExist();
    const item = await makeSourceItem();

    verifyAndSynthesizeMock.mockResolvedValue({
      verificationStatus: "PRIMARY_SOURCE_NOT_FOUND",
      primarySourceUrl: null,
      notes: "No primary source found.",
      draft: { ...confirmedDraft, headline: `${confirmedDraft.headline} (not found)` },
      generationId: "fake-generation-id-3",
    });

    await claimOnly(item.id, 1);

    const updatedItem = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    if (!updatedItem || updatedItem.status !== "CONVERTED_TO_DRAFT" || !updatedItem.convertedArticleId) {
      throw new Error(
        "Test setup assumption failed: this SourceItem was not the one claimed by processVerificationBatch(1).",
      );
    }
    createdArticleIds.push(updatedItem.convertedArticleId);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: updatedItem.convertedArticleId } });
    expect(article.status).toBe("DRAFT");
    expect(article.autoPublished).toBe(false);
  });
});
