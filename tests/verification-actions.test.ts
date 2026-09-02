import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const verifyAndSynthesizeMock = vi.fn();
vi.mock("../lib/ai/verify-and-synthesize", () => ({
  verifyAndSynthesize: verifyAndSynthesizeMock,
}));

const { processVerificationBatch, UNCATEGORIZED_CATEGORY_SLUG } = await import("../lib/verification-actions");
const { prisma } = await import("../lib/prisma");
const { getSystemUserId } = await import("../lib/system-actor");
const { cleanupTestData } = await import("./helpers");

const confirmedDraft = {
  headline: `Auto-publish gate test headline ${Date.now()}`,
  excerpt: "A short original excerpt for the gate test.",
  blocks: [{ type: "paragraph" as const, text: "Original synthesized body text." }],
};

const ORIGINAL_ALLOWLIST = process.env.AUTO_PUBLISH_CATEGORY_SLUGS;

const createdArticleIds: string[] = [];
const createdSourceIds: string[] = [];
const createdItemIds: string[] = [];
const createdMediaIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdAuthorIds: string[] = [];
const createdGenerationIds: string[] = [];

async function makeSourceItem(categoryId?: string) {
  const source = await prisma.source.create({
    data: { name: `Gate Test Source ${Date.now()}-${Math.random()}`, url: "https://gate-test-outlet.test", type: "RSS", tier: "TIER_2", categoryId },
  });
  createdSourceIds.push(source.id);
  const item = await prisma.sourceItem.create({
    data: {
      sourceId: source.id,
      sourceUrl: `https://gate-test-outlet.test/story-${Date.now()}-${Math.random()}`,
      headline: "A discovered tech story headline for the gate test",
      normalizedTitle: "a discovered tech story headline for the gate test",
      status: "NEW",
      // Real ingestion (lib/ingestion/ingest.ts's processIngestedItems)
      // always copies Source.categoryId onto the SourceItem at creation
      // time — mirrored here so item.category is populated exactly like a
      // real discovered item's would be, rather than silently depending on
      // processVerificationBatch's Uncategorized fallback for every test
      // fixture regardless of the categoryId passed in above.
      categoryId,
    },
  });
  createdItemIds.push(item.id);
  return item;
}

/** verifyAndSynthesize() always produces a real AIGeneration row before
 * returning a generationId (via runTask) — mocking it here with a made-up
 * string id would violate Article.verificationGenerationId's real FK
 * constraint the moment processVerificationBatch tries to create the
 * article, so every mocked result needs one of these instead. */
async function makeGeneration(): Promise<string> {
  const systemUserId = await getSystemUserId();
  const generation = await prisma.aIGeneration.create({
    data: { task: "VERIFY_PRIMARY_SOURCE", model: "test-model", status: "COMPLETE", requestedById: systemUserId },
  });
  createdGenerationIds.push(generation.id);
  return generation.id;
}

/** Any real, usable Category — tests pass its id directly to makeSourceItem
 * so the SourceItem is unambiguously categorized, and set
 * AUTO_PUBLISH_CATEGORY_SLUGS to its slug. Excludes the reserved
 * "uncategorized" fallback category (see the dedicated test for that one)
 * so these gate tests exercise a normal, directly-assigned category. */
async function getUsableCategory() {
  const existing = await prisma.category.findFirst({ where: { slug: { not: UNCATEGORIZED_CATEGORY_SLUG } }, orderBy: { name: "asc" } });
  if (existing) return existing;
  const created = await prisma.category.create({
    data: { name: `Gate Test Category ${Date.now()}`, slug: `gate-test-category-${Date.now()}` },
  });
  createdCategoryIds.push(created.id);
  return created;
}

/** Finds or creates the real, reserved fallback category
 * (lib/verification-actions.ts's UNCATEGORIZED_CATEGORY_SLUG) — Stage 6B
 * seeds this permanently in production, but a test run shouldn't assume
 * that seed already happened. */
async function getOrCreateUncategorizedCategory() {
  const existing = await prisma.category.findUnique({ where: { slug: UNCATEGORIZED_CATEGORY_SLUG } });
  if (existing) return existing;
  const created = await prisma.category.create({
    data: { name: "Uncategorized", slug: UNCATEGORIZED_CATEGORY_SLUG, active: false, participatesInQuota: false },
  });
  createdCategoryIds.push(created.id);
  return created;
}

async function ensureAuthorExists(): Promise<void> {
  const author = await prisma.author.findFirst();
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
  process.env.AUTO_PUBLISH_CATEGORY_SLUGS = ORIGINAL_ALLOWLIST;
});

afterAll(async () => {
  if (createdArticleIds.length) await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
  if (createdMediaIds.length) await prisma.media.deleteMany({ where: { id: { in: createdMediaIds } } });
  if (createdItemIds.length) await prisma.sourceItem.deleteMany({ where: { id: { in: createdItemIds } } });
  if (createdSourceIds.length) await prisma.source.deleteMany({ where: { id: { in: createdSourceIds } } });
  if (createdCategoryIds.length) await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  if (createdAuthorIds.length) await prisma.author.deleteMany({ where: { id: { in: createdAuthorIds } } });
  if (createdGenerationIds.length) await prisma.aIGeneration.deleteMany({ where: { id: { in: createdGenerationIds } } });
  if (setAsideItemIds.length) {
    // Restore to NEW is a best-effort courtesy to whichever other file's
    // fixture this was — it's already outside this file's own tracked ids,
    // so this can't put back anything this file itself needs to clean up.
    await prisma.sourceItem.updateMany({ where: { id: { in: setAsideItemIds } }, data: { status: "NEW" } });
  }
  process.env.AUTO_PUBLISH_CATEGORY_SLUGS = ORIGINAL_ALLOWLIST;
  await cleanupTestData();
});

describe("processVerificationBatch — the auto-publish gate", () => {
  it("does NOT auto-publish when verificationStatus claims PRIMARY_SOURCE_CONFIRMED but a publication check fails (unreviewed image)", async () => {
    const category = await getUsableCategory();
    await ensureAuthorExists();
    process.env.AUTO_PUBLISH_CATEGORY_SLUGS = category.slug; // allowlisted — proves the IMAGE check is what blocks this, not the allowlist
    const item = await makeSourceItem(category.id);
    const systemUserId = await getSystemUserId();
    const generationId = await makeGeneration();

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
      secondarySourceUrl: null,
      verificationConfidence: 85,
      claimsChecked: ["The product was announced."],
      notes: "Confirmed by the official newsroom statement.",
      draft: confirmedDraft,
      generationId,
    });

    const summary = await claimOnly(item.id, 1);
    expect(summary.itemsProcessed).toBeGreaterThanOrEqual(0);

    const updatedItem = await prisma.sourceItem.findUnique({ where: { id: item.id } });
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
    expect(article.verificationConfidence).toBe(85);
    expect(article.claimsChecked).toEqual(["The product was announced."]);
    expect(article.verificationGenerationId).toBe(generationId);
    expect(summary.autoPublished).toBe(0);
    expect(summary.sentToReview).toBe(1);
  });

  it("DOES auto-publish when verificationStatus is PRIMARY_SOURCE_CONFIRMED, every publication check passes, AND the category is allowlisted", async () => {
    const category = await getUsableCategory();
    await ensureAuthorExists();
    process.env.AUTO_PUBLISH_CATEGORY_SLUGS = category.slug;
    const item = await makeSourceItem(category.id);
    const generationId = await makeGeneration();

    verifyAndSynthesizeMock.mockResolvedValue({
      verificationStatus: "PRIMARY_SOURCE_CONFIRMED",
      primarySourceUrl: "https://official-newsroom.test/press-release-2",
      secondarySourceUrl: "https://reputable-tech-media.test/story",
      verificationConfidence: 92,
      claimsChecked: ["The product was announced.", "It ships next month."],
      notes: "Confirmed by the official newsroom statement, corroborated independently.",
      draft: { ...confirmedDraft, headline: `${confirmedDraft.headline} (clean)` },
      generationId,
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
    expect(article.secondarySourceUrl).toBe("https://reputable-tech-media.test/story");
    expect(article.verifiedAt).not.toBeNull();
    expect(summary.autoPublished).toBe(1);

    const version = await prisma.articleVersion.findFirst({ where: { articleId: article.id }, orderBy: { versionNumber: "desc" } });
    expect(version?.status).toBe("PUBLISHED");
    const audit = await prisma.auditLog.findFirst({ where: { entityId: article.id, action: "article_published" } });
    expect(audit).not.toBeNull();
  });

  it("does NOT auto-publish when verificationStatus is PRIMARY_SOURCE_CONFIRMED and other checks pass, but the draft is too textually similar to its source (originality gate)", async () => {
    const category = await getUsableCategory();
    await ensureAuthorExists();
    process.env.AUTO_PUBLISH_CATEGORY_SLUGS = category.slug; // allowlisted — proves originality is what blocks this
    const item = await makeSourceItem(category.id);
    const generationId = await makeGeneration();

    verifyAndSynthesizeMock.mockResolvedValue({
      verificationStatus: "PRIMARY_SOURCE_CONFIRMED",
      primarySourceUrl: "https://official-newsroom.test/press-release-originality",
      secondarySourceUrl: null,
      verificationConfidence: 90,
      claimsChecked: ["The product was announced."],
      notes: "Confirmed, but the draft copied too closely from the source.",
      draft: { ...confirmedDraft, headline: `${confirmedDraft.headline} (near-verbatim)` },
      generationId,
      originalityScore: 0.9, // well above ORIGINALITY_BLOCK_THRESHOLD (0.35)
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
    expect(article.status).toBe("IN_REVIEW");
    expect(article.autoPublished).toBe(false);
    expect(article.originalityScore).toBe(0.9);
    expect(summary.autoPublished).toBe(0);
    expect(summary.sentToReview).toBe(1);
  });

  it("does NOT auto-publish when verificationStatus is PRIMARY_SOURCE_CONFIRMED and checks pass, but the category is NOT allowlisted (kill switch)", async () => {
    const category = await getUsableCategory();
    await ensureAuthorExists();
    process.env.AUTO_PUBLISH_CATEGORY_SLUGS = ""; // empty — nothing allowed, the default/starting state
    const item = await makeSourceItem(category.id);
    const generationId = await makeGeneration();

    verifyAndSynthesizeMock.mockResolvedValue({
      verificationStatus: "PRIMARY_SOURCE_CONFIRMED",
      primarySourceUrl: "https://official-newsroom.test/press-release-3",
      secondarySourceUrl: null,
      verificationConfidence: 90,
      claimsChecked: [],
      notes: "Confirmed, but this category isn't allowlisted yet.",
      draft: { ...confirmedDraft, headline: `${confirmedDraft.headline} (not allowlisted)` },
      generationId,
    });

    const summary = await claimOnly(item.id, 1);
    // Sanity: this test is only meaningful if the category really was
    // excluded by an empty allowlist, not by some other accident.
    expect(category.slug).not.toBe("");

    const updatedItem = await prisma.sourceItem.findUnique({ where: { id: item.id } });
    if (!updatedItem || updatedItem.status !== "CONVERTED_TO_DRAFT" || !updatedItem.convertedArticleId) {
      throw new Error(
        "Test setup assumption failed: this SourceItem was not the one claimed by processVerificationBatch(1).",
      );
    }
    createdArticleIds.push(updatedItem.convertedArticleId);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: updatedItem.convertedArticleId } });
    expect(article.status).toBe("IN_REVIEW");
    expect(article.autoPublished).toBe(false);
    expect(summary.autoPublished).toBe(0);
  });

  it("does not auto-publish when verificationStatus is anything other than PRIMARY_SOURCE_CONFIRMED", async () => {
    const category = await getUsableCategory();
    await ensureAuthorExists();
    process.env.AUTO_PUBLISH_CATEGORY_SLUGS = category.slug; // allowlisted — proves verificationStatus is what blocks this
    const item = await makeSourceItem(category.id);
    const generationId = await makeGeneration();

    verifyAndSynthesizeMock.mockResolvedValue({
      verificationStatus: "PRIMARY_SOURCE_NOT_FOUND",
      primarySourceUrl: null,
      secondarySourceUrl: null,
      verificationConfidence: null,
      claimsChecked: [],
      notes: "No primary source found.",
      draft: { ...confirmedDraft, headline: `${confirmedDraft.headline} (not found)` },
      generationId,
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

  it("files a SourceItem with no category into the reserved Uncategorized category, and never auto-publishes it even if mistakenly allowlisted — never guesses a real topic category", async () => {
    const uncategorized = await getOrCreateUncategorizedCategory();
    await ensureAuthorExists();
    // Deliberately allowlisted — proves isCategoryAllowedForAutoPublish's
    // own hard exclusion is what blocks this, not just "nobody would
    // normally allowlist it."
    process.env.AUTO_PUBLISH_CATEGORY_SLUGS = uncategorized.slug;
    const item = await makeSourceItem(); // no categoryId — the case this test covers
    const generationId = await makeGeneration();

    verifyAndSynthesizeMock.mockResolvedValue({
      verificationStatus: "PRIMARY_SOURCE_CONFIRMED",
      primarySourceUrl: "https://official-newsroom.test/press-release-uncategorized",
      secondarySourceUrl: null,
      verificationConfidence: 88,
      claimsChecked: ["The product was announced."],
      notes: "Confirmed, but this item's Source has no category.",
      draft: { ...confirmedDraft, headline: `${confirmedDraft.headline} (uncategorized)` },
      generationId,
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
    expect(article.categoryId).toBe(uncategorized.id);
    expect(article.status).not.toBe("PUBLISHED");
    expect(article.autoPublished).toBe(false);
    expect(summary.autoPublished).toBe(0);
    expect(summary.skippedNoCategory).toBe(0);
  });
});
