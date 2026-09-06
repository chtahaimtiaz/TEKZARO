import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const generateWithAIMock = vi.fn();
vi.mock("../lib/ai/provider", () => ({
  generateWithAI: generateWithAIMock,
  isAIConfigured: () => true,
  AI_MODEL: "test-model",
  AIProviderNotConfiguredError: class AIProviderNotConfiguredError extends Error {},
  aiModelId: () => "test-model",
}));

const { improveArticleDraft, buildEvidenceBundleFromArticle } = await import("../lib/ai/improve-article");
const { prisma } = await import("../lib/prisma");
const { getSystemUserId } = await import("../lib/system-actor");
const { createTestUser, trackUser, cleanupTestData } = await import("./helpers");

const createdArticleIds: string[] = [];
const createdGenerationIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdAuthorIds: string[] = [];

async function makeArticle() {
  const category = await prisma.category.findFirst({ orderBy: { name: "asc" } });
  const author = (await prisma.author.findFirst()) ?? (await prisma.author.create({ data: { name: `Improve test author ${Date.now()}`, slug: `improve-test-author-${Date.now()}` } }));
  if (!(await prisma.author.findFirst({ where: { id: author.id } }))) createdAuthorIds.push(author.id);
  const systemUserId = await getSystemUserId();
  const article = await prisma.article.create({
    data: {
      slug: `improve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: "Original headline about a funding round",
      excerpt: "Original excerpt.",
      content: { blocks: [{ type: "paragraph", text: "The company raised $50 million, according to TechCrunch." }] },
      status: "DRAFT",
      categoryId: category!.id,
      authorId: author.id,
      createdById: systemUserId,
    },
  });
  createdArticleIds.push(article.id);
  return article;
}

async function makeGenerationId(): Promise<string> {
  const systemUserId = await getSystemUserId();
  const gen = await prisma.aIGeneration.create({ data: { task: "SYNTHESIZE_ARTICLE", model: "test-model", status: "COMPLETE", requestedById: systemUserId } });
  createdGenerationIds.push(gen.id);
  return gen.id;
}

beforeEach(() => vi.clearAllMocks());
afterAll(async () => {
  if (createdArticleIds.length) await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
  if (createdGenerationIds.length) await prisma.aIGeneration.deleteMany({ where: { id: { in: createdGenerationIds } } });
  if (createdCategoryIds.length) await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  if (createdAuthorIds.length) await prisma.author.deleteMany({ where: { id: { in: createdAuthorIds } } });
  await cleanupTestData();
});

describe("buildEvidenceBundleFromArticle", () => {
  it("reconstructs a bundle from the article's persisted EvidenceRecord rows", async () => {
    const article = await makeArticle();
    const generationId = await makeGenerationId();
    await prisma.evidenceRecord.create({
      data: {
        generationId, articleId: article.id, url: "https://techcrunch.com/story", hostname: "techcrunch.com",
        rank: 3, rankLabel: "Specialist", title: "Story", author: null, publishedAt: null,
        extractedText: "The company raised $50 million, according to TechCrunch.", extractionLength: 60,
        isOriginatingOutlet: true, isPrimary: false, isCorroborating: false,
      },
    });

    const bundle = await buildEvidenceBundleFromArticle(article.id);
    expect(bundle.documents).toHaveLength(1);
    expect(bundle.documents[0].hostname).toBe("techcrunch.com");
    expect(bundle.notes).toHaveLength(0);
  });

  it("returns a concrete, empty bundle (never null) when nothing was ever persisted", async () => {
    const article = await makeArticle();
    const bundle = await buildEvidenceBundleFromArticle(article.id);
    expect(bundle.documents).toHaveLength(0);
    expect(bundle.richness).toBe("THIN");
    expect(bundle.notes.length).toBeGreaterThan(0);
  });
});

describe("improveArticleDraft", () => {
  it("applies an improvement that introduces no new unsupported claims", async () => {
    const user = await createTestUser("EDITOR", "improve-safe");
    trackUser(user.id);
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({
        headline: "Tightened headline about the funding round",
        excerpt: "Tightened excerpt.",
        blocks: [{ type: "paragraph", text: "TechCrunch reports the company raised $50 million." }],
      }),
    );

    const evidence = {
      documents: [{ url: "https://techcrunch.com/x", hostname: "techcrunch.com", rank: 3, rankLabel: "x", title: null, author: null, publishedAt: null, text: "The company raised $50 million, TechCrunch reported.", isOriginatingOutlet: true }],
      richness: "MODERATE" as const, totalChars: 60, primary: null, corroborating: null, notes: [],
    };

    const result = await improveArticleDraft({
      requestedById: user.id,
      articleId: "article-x",
      current: { title: "Original", excerpt: "Original excerpt", blocks: [{ type: "paragraph", text: "The company raised $50 million, according to TechCrunch." }] },
      evidence,
    });

    expect(result.ok).toBe(true);
    if (result.generationId) createdGenerationIds.push(result.generationId);
    expect(result.draft?.title).toBe("Tightened headline about the funding round");
  });

  it("rejects an improvement that introduces a new unsupported figure", async () => {
    const user = await createTestUser("EDITOR", "improve-unsafe");
    trackUser(user.id);
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({
        headline: "Headline",
        excerpt: "Excerpt",
        // Invents an 85% figure absent from both the original and the evidence.
        blocks: [{ type: "paragraph", text: "The company raised $50 million, and revenue grew 85% this quarter." }],
      }),
    );

    const evidence = {
      documents: [{ url: "https://techcrunch.com/x", hostname: "techcrunch.com", rank: 3, rankLabel: "x", title: null, author: null, publishedAt: null, text: "The company raised $50 million.", isOriginatingOutlet: true }],
      richness: "MODERATE" as const, totalChars: 40, primary: null, corroborating: null, notes: [],
    };

    const result = await improveArticleDraft({
      requestedById: user.id,
      articleId: "article-y",
      current: { title: "Original", excerpt: "Original excerpt", blocks: [{ type: "paragraph", text: "The company raised $50 million." }] },
      evidence,
    });

    expect(result.ok).toBe(false);
    expect(result.rejectedForNewUnsupportedClaims).toBe(true);
    if (result.generationId) createdGenerationIds.push(result.generationId);
  });

  it("does not reject when the improved draft carries the SAME already-unsupported claims as the original, just reworded", async () => {
    const user = await createTestUser("EDITOR", "improve-same-claims");
    trackUser(user.id);
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({
        headline: "Headline",
        excerpt: "Excerpt",
        blocks: [{ type: "paragraph", text: "Sales reportedly grew 85% this quarter, though this figure is unconfirmed." }],
      }),
    );
    const evidence = { documents: [], richness: "THIN" as const, totalChars: 0, primary: null, corroborating: null, notes: [] };

    const result = await improveArticleDraft({
      requestedById: user.id,
      articleId: "article-z",
      current: { title: "Original", excerpt: "Original excerpt", blocks: [{ type: "paragraph", text: "Sales reportedly grew 85% this quarter." }] },
      evidence,
    });

    expect(result.ok).toBe(true);
    if (result.generationId) createdGenerationIds.push(result.generationId);
  });
});
