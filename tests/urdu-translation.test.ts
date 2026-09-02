import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";

const runTaskMock = vi.fn();
vi.mock("../lib/ai/tasks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ai/tasks")>();
  return { ...actual, runTask: runTaskMock };
});

const {
  requestUrduTranslationAction,
  regenerateUrduTranslationAction,
  updateUrduTranslationAction,
  publishUrduTranslationAction,
  unpublishUrduTranslationAction,
} = await import("../lib/urdu-translation-actions");
const { getUrduTranslation, getPublishedUrduTranslationBySlug } = await import("../lib/urdu-translation");
const { prisma } = await import("../lib/prisma");
const { getSystemUserId } = await import("../lib/system-actor");
const { createTestUser, loginAs, clearSession, trackUser, trackArticle, cleanupTestData } = await import("./helpers");

const goodUrduResponse = {
  ok: true,
  generationId: "",
  text: JSON.stringify({
    title: "اے آئی کی نئی پیشرفت",
    dek: "ایک مختصر ذیلی عنوان",
    blocks: [{ type: "paragraph", text: "یہ ایک ترجمہ شدہ پیراگراف ہے۔" }],
    metaDescription: "میٹا تفصیل",
    socialTitle: "سوشل عنوان",
    socialDescription: "سوشل تفصیل",
  }),
};

let categoryId: string;
let authorId: string;
const createdArticleIds: string[] = [];

async function makePublishedArticle(overrides: Partial<{ status: "DRAFT" | "PUBLISHED" }> = {}) {
  const article = await prisma.article.create({
    data: {
      slug: `urdu-test-article-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Urdu Test Article ${Date.now()}`,
      content: { blocks: [{ type: "paragraph", text: "Original English paragraph." }] },
      status: overrides.status ?? "PUBLISHED",
      publishedAt: (overrides.status ?? "PUBLISHED") === "PUBLISHED" ? new Date() : null,
      categoryId,
      authorId,
    },
  });
  createdArticleIds.push(article.id);
  trackArticle(article.id);
  return article;
}

async function makeGeneration(): Promise<string> {
  const systemUserId = await getSystemUserId();
  const generation = await prisma.aIGeneration.create({
    data: { task: "TRANSLATE_URDU", model: "test-model", status: "COMPLETE", requestedById: systemUserId },
  });
  return generation.id;
}

async function asEditor() {
  const editor = await createTestUser("EDITOR", "urdu-translation");
  trackUser(editor.id);
  await loginAs(editor.id);
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `Urdu Test Category ${Date.now()}`, slug: `urdu-test-category-${Date.now()}` },
  });
  categoryId = category.id;
  const author = await prisma.author.create({
    data: { name: `Urdu Test Author ${Date.now()}`, slug: `urdu-test-author-${Date.now()}` },
  });
  authorId = author.id;
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  if (createdArticleIds.length) {
    await prisma.articleTranslation.deleteMany({ where: { articleId: { in: createdArticleIds } } });
  }
  clearSession();
  await cleanupTestData();
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
});

describe("Urdu translation", () => {
  it("requesting a translation creates ArticleTranslation belonging to the correct Article, and never touches the English article", async () => {
    await asEditor();
    const article = await makePublishedArticle();
    const originalUpdatedAt = article.updatedAt;
    runTaskMock.mockResolvedValue({ ...goodUrduResponse, generationId: await makeGeneration() });

    const result = await requestUrduTranslationAction(article.id);
    expect(result.ok).toBe(true);

    const translation = await prisma.articleTranslation.findUnique({ where: { articleId: article.id } });
    expect(translation).not.toBeNull();
    expect(translation!.articleId).toBe(article.id);
    expect(translation!.status).toBe("READY");
    expect(translation!.title).toBe("اے آئی کی نئی پیشرفت");
    expect(translation!.slug).toBe(article.slug);

    const englishAfter = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(englishAfter.title).toBe(article.title);
    expect(englishAfter.content).toEqual(article.content);
    expect(englishAfter.status).toBe("PUBLISHED");
    expect(englishAfter.updatedAt.getTime()).toBe(originalUpdatedAt.getTime());
  });

  it("status transitions through GENERATING to READY on success", async () => {
    await asEditor();
    const article = await makePublishedArticle();
    let sawGenerating = false;
    runTaskMock.mockImplementation(async () => {
      const mid = await prisma.articleTranslation.findUnique({ where: { articleId: article.id } });
      sawGenerating = mid?.status === "GENERATING";
      return { ...goodUrduResponse, generationId: await makeGeneration() };
    });

    await requestUrduTranslationAction(article.id);
    expect(sawGenerating).toBe(true);
    const final = await prisma.articleTranslation.findUniqueOrThrow({ where: { articleId: article.id } });
    expect(final.status).toBe("READY");
  });

  it("a translation failure (AI not configured) marks the translation FAILED and never breaks the English article", async () => {
    await asEditor();
    const article = await makePublishedArticle();
    runTaskMock.mockResolvedValue({ ok: false, generationId: await makeGeneration(), notConfigured: true });

    const result = await requestUrduTranslationAction(article.id);
    expect(result.ok).toBe(false);

    const translation = await prisma.articleTranslation.findUniqueOrThrow({ where: { articleId: article.id } });
    expect(translation.status).toBe("FAILED");
    expect(translation.failureReason).toContain("AI provider");

    const englishAfter = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(englishAfter.status).toBe("PUBLISHED");
    expect(englishAfter.title).toBe(article.title);
  });

  it("an unparseable AI response also fails safely without touching English", async () => {
    await asEditor();
    const article = await makePublishedArticle();
    runTaskMock.mockResolvedValue({ ok: true, text: "not valid json at all", generationId: await makeGeneration() });

    const result = await requestUrduTranslationAction(article.id);
    expect(result.ok).toBe(false);
    const translation = await prisma.articleTranslation.findUniqueOrThrow({ where: { articleId: article.id } });
    expect(translation.status).toBe("FAILED");
  });

  it("manual edits are protected: regenerate refuses without confirmOverwrite, succeeds with it", async () => {
    await asEditor();
    const article = await makePublishedArticle();

    const editResult = await updateUrduTranslationAction(article.id, {
      title: "دستی طور پر لکھا گیا عنوان",
      dek: "",
      seoTitle: "",
      metaDescription: "",
      socialTitle: "",
      socialDescription: "",
      blocks: [{ type: "paragraph", text: "یہ دستی متن ہے۔" }],
    });
    expect(editResult.ok).toBe(true);

    const afterEdit = await prisma.articleTranslation.findUniqueOrThrow({ where: { articleId: article.id } });
    expect(afterEdit.manuallyEdited).toBe(true);
    expect(afterEdit.title).toBe("دستی طور پر لکھا گیا عنوان");

    runTaskMock.mockResolvedValue({ ...goodUrduResponse, generationId: await makeGeneration() });

    const refused = await regenerateUrduTranslationAction(article.id, false);
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain("manual edits");
    const stillManual = await prisma.articleTranslation.findUniqueOrThrow({ where: { articleId: article.id } });
    expect(stillManual.title).toBe("دستی طور پر لکھا گیا عنوان"); // unchanged

    const confirmed = await regenerateUrduTranslationAction(article.id, true);
    expect(confirmed.ok).toBe(true);
    const afterRegenerate = await prisma.articleTranslation.findUniqueOrThrow({ where: { articleId: article.id } });
    expect(afterRegenerate.title).toBe("اے آئی کی نئی پیشرفت");
    expect(afterRegenerate.manuallyEdited).toBe(false);
  });

  it("publishing Urdu requires the English article to already be published", async () => {
    await asEditor();
    const draftArticle = await makePublishedArticle({ status: "DRAFT" });
    await updateUrduTranslationAction(draftArticle.id, {
      title: "عنوان",
      dek: "",
      seoTitle: "",
      metaDescription: "",
      socialTitle: "",
      socialDescription: "",
      blocks: [{ type: "paragraph", text: "متن۔" }],
    });

    const result = await publishUrduTranslationAction(draftArticle.id);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("English article must be published");

    const translation = await prisma.articleTranslation.findUniqueOrThrow({ where: { articleId: draftArticle.id } });
    expect(translation.status).not.toBe("PUBLISHED");
  });

  it("unpublished Urdu is not publicly exposed; published Urdu is", async () => {
    await asEditor();
    const article = await makePublishedArticle();
    await updateUrduTranslationAction(article.id, {
      title: "قابل اشاعت عنوان",
      dek: "",
      seoTitle: "",
      metaDescription: "",
      socialTitle: "",
      socialDescription: "",
      blocks: [{ type: "paragraph", text: "متن۔" }],
    });

    const beforePublish = await getPublishedUrduTranslationBySlug(article.slug);
    expect(beforePublish).toBeNull();

    const publishResult = await publishUrduTranslationAction(article.id);
    expect(publishResult.ok).toBe(true);

    const afterPublish = await getPublishedUrduTranslationBySlug(article.slug);
    expect(afterPublish).not.toBeNull();
    expect(afterPublish!.title).toBe("قابل اشاعت عنوان");

    const unpublishResult = await unpublishUrduTranslationAction(article.id);
    expect(unpublishResult.ok).toBe(true);
    const afterUnpublish = await getPublishedUrduTranslationBySlug(article.slug);
    expect(afterUnpublish).toBeNull();
  });

  it("getUrduTranslation reports outdated=true once the English article is edited after the translation was last touched", async () => {
    await asEditor();
    const article = await makePublishedArticle();
    runTaskMock.mockResolvedValue({ ...goodUrduResponse, generationId: await makeGeneration() });
    await requestUrduTranslationAction(article.id);

    const freshView = await getUrduTranslation(article.id);
    expect(freshView!.outdated).toBe(false);

    // Simulate an English edit happening after translation generation —
    // bump updatedAt forward past the translation's generatedAt.
    await new Promise((r) => setTimeout(r, 10));
    await prisma.article.update({ where: { id: article.id }, data: { title: `${article.title} (edited)` } });

    const staleView = await getUrduTranslation(article.id);
    expect(staleView!.outdated).toBe(true);
  });

  it("requires CAN_EDIT_ANY — an unauthenticated call is rejected", async () => {
    clearSession();
    const article = await makePublishedArticle();
    await expect(requestUrduTranslationAction(article.id)).rejects.toThrow();
  });
});
