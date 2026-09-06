import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { Prisma } from "@prisma/client";

const improveArticleDraftMock = vi.fn();
const buildEvidenceBundleFromArticleMock = vi.fn();
vi.mock("../lib/ai/improve-article", () => ({
  improveArticleDraft: improveArticleDraftMock,
  buildEvidenceBundleFromArticle: buildEvidenceBundleFromArticleMock,
}));

const { improveArticleAction } = await import("../lib/article-ai-actions");
const { prisma } = await import("../lib/prisma");
const { getSystemUserId } = await import("../lib/system-actor");
const { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } = await import("./helpers");

const createdArticleIds: string[] = [];
const createdAuthorIds: string[] = [];

async function makeArticle(overrides: { title?: string; blocks?: unknown[] } = {}) {
  const category = await prisma.category.findFirst({ orderBy: { name: "asc" } });
  const author = await prisma.author.create({ data: { name: `Improve action test author ${Date.now()}-${Math.random()}`, slug: `improve-action-author-${Date.now()}-${Math.random().toString(36).slice(2)}` } });
  createdAuthorIds.push(author.id);
  const systemUserId = await getSystemUserId();
  const article = await prisma.article.create({
    data: {
      slug: `improve-action-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: overrides.title ?? "Original title",
      excerpt: "Original excerpt",
      content: { blocks: overrides.blocks ?? [{ type: "paragraph", text: "Original body text." }] } as object as Prisma.InputJsonValue,
      status: "DRAFT",
      categoryId: category!.id,
      authorId: author.id,
      createdById: systemUserId,
    },
  });
  createdArticleIds.push(article.id);
  return article;
}

beforeEach(() => vi.clearAllMocks());
afterAll(async () => {
  if (createdArticleIds.length) await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
  if (createdAuthorIds.length) await prisma.author.deleteMany({ where: { id: { in: createdAuthorIds } } });
  clearSession();
  await cleanupTestData();
});

describe("improveArticleAction", () => {
  it("requires CAN_WRITE", async () => {
    // No session at all — requireRole must refuse a signed-out call.
    clearSession();
    const article = await makeArticle();
    await expect(improveArticleAction(article.id)).rejects.toThrow();
  });

  it("snapshots the pre-improvement content as a real, restorable version before applying anything", async () => {
    const editor = await createTestUser("EDITOR", "improve-action-success");
    trackUser(editor.id);
    await loginAs(editor.id);
    const article = await makeArticle({ title: "Before improvement" });

    buildEvidenceBundleFromArticleMock.mockResolvedValue({ documents: [], richness: "THIN", totalChars: 0, primary: null, corroborating: null, notes: [] });
    improveArticleDraftMock.mockResolvedValue({
      ok: true,
      generationId: null,
      draft: { title: "After improvement", excerpt: "New excerpt", blocks: [{ type: "paragraph", text: "Improved body text." }] },
    });

    const result = await improveArticleAction(article.id);
    expect(result.ok).toBe(true);

    const updated = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(updated.title).toBe("After improvement");
    expect((updated.content as { blocks: { text: string }[] }).blocks[0].text).toBe("Improved body text.");

    const versions = await prisma.articleVersion.findMany({ where: { articleId: article.id } });
    expect(versions.length).toBeGreaterThan(0);
    const preImprovementVersion = versions.find((v) => v.title === "Before improvement");
    expect(preImprovementVersion).toBeDefined();
    expect(preImprovementVersion!.changeSummary).toMatch(/before ai-assisted improvement/i);
  });

  it("leaves the article completely untouched when the improvement is rejected", async () => {
    const editor = await createTestUser("EDITOR", "improve-action-rejected");
    trackUser(editor.id);
    await loginAs(editor.id);
    const article = await makeArticle({ title: "Should stay unchanged" });

    buildEvidenceBundleFromArticleMock.mockResolvedValue({ documents: [], richness: "THIN", totalChars: 0, primary: null, corroborating: null, notes: [] });
    improveArticleDraftMock.mockResolvedValue({ ok: false, rejectedForNewUnsupportedClaims: true, error: "Introduced a new unsupported figure." });

    const result = await improveArticleAction(article.id);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported figure/i);

    const untouched = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(untouched.title).toBe("Should stay unchanged");
    const versions = await prisma.articleVersion.findMany({ where: { articleId: article.id } });
    expect(versions).toHaveLength(0);
  });

  it("refuses an article with no content to improve", async () => {
    const editor = await createTestUser("EDITOR", "improve-action-empty");
    trackUser(editor.id);
    await loginAs(editor.id);
    const article = await makeArticle({ blocks: [] });

    const result = await improveArticleAction(article.id);
    expect(result.ok).toBe(false);
    expect(improveArticleDraftMock).not.toHaveBeenCalled();
  });

  it("never touches category, author, or workflow status", async () => {
    const editor = await createTestUser("EDITOR", "improve-action-scope");
    trackUser(editor.id);
    await loginAs(editor.id);
    const article = await makeArticle();
    const before = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });

    buildEvidenceBundleFromArticleMock.mockResolvedValue({ documents: [], richness: "THIN", totalChars: 0, primary: null, corroborating: null, notes: [] });
    improveArticleDraftMock.mockResolvedValue({
      ok: true, generationId: null,
      draft: { title: "New title", excerpt: "New excerpt", blocks: [{ type: "paragraph", text: "New body." }] },
    });

    await improveArticleAction(article.id);
    const after = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(after.categoryId).toBe(before.categoryId);
    expect(after.authorId).toBe(before.authorId);
    expect(after.status).toBe(before.status);
  });
});
