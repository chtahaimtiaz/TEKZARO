import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "../lib/prisma";
import { createDraftFromItemAction } from "../lib/discovery-actions";
import { createTestUser, loginAs, clearSession, trackUser, trackArticle, cleanupTestData } from "./helpers";

// vi.hoisted so this mock function exists before vi.mock's factory runs
// (vi.mock calls are hoisted above imports) — lets each test set a
// different generateWithAI response instead of one fixed value for the
// whole file, matching tests/ai-tasks-mocked.test.ts's mocking style but
// per-test-configurable.
const { generateWithAIMock } = vi.hoisted(() => ({ generateWithAIMock: vi.fn() }));

vi.mock("../lib/ai/provider", () => ({
  isAIConfigured: () => true,
  generateWithAI: generateWithAIMock,
  AI_MODEL: "claude-sonnet-5",
  AIProviderNotConfiguredError: class extends Error {},
}));

let categoryId: string;
let authorId: string;
let sourceId: string;
const createdSourceItemIds: string[] = [];

afterAll(async () => {
  clearSession();
  if (createdSourceItemIds.length) await prisma.sourceItem.deleteMany({ where: { id: { in: createdSourceItemIds } } });
  // cleanupTestData() deletes tracked Articles first — must run before
  // Author/Category are removed, since Article.authorId/categoryId are
  // required (non-cascading) FKs.
  await cleanupTestData();
  if (sourceId) await prisma.source.deleteMany({ where: { id: sourceId } });
  if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
});

async function makeItem(headline: string, excerpt: string) {
  if (!categoryId) {
    // "ZZZ" prefix is deliberate — see the matching note in
    // tests/article-media.test.ts: an alphabetically-early category name
    // gets picked up by processVerificationBatch's/getUsableCategory's
    // shared prisma.category.findFirst({orderBy:{name:"asc"}}) fallback,
    // which then creates a real, untracked Article against it.
    const category = await prisma.category.create({
      data: { name: `ZZZ AI Draft Cat ${Date.now()}`, slug: `zzz-ai-draft-cat-${Date.now()}` },
    });
    categoryId = category.id;
  }
  if (!authorId) {
    // Restricted to this file's own dedicated category — NOT a generalist.
    // A generalist author is eligible for every category, which means a
    // concurrently-running test file's own pickEligibleAuthor() call could
    // select it for one of THEIR articles; that article is untracked by
    // this file's cleanup and blocks the author delete below with a
    // dangling FK (observed: Article_authorId_fkey violation under -run).
    const author = await prisma.author.create({
      data: {
        name: `AI Draft Author ${Date.now()}`,
        slug: `ai-draft-author-${Date.now()}`,
        categories: { connect: [{ id: categoryId }] },
      },
    });
    authorId = author.id;
  }
  if (!sourceId) {
    const source = await prisma.source.create({
      data: { name: `AI Draft Source ${Date.now()}`, url: "https://example.com", type: "RSS", tier: "TIER_2" },
    });
    sourceId = source.id;
  }
  const item = await prisma.sourceItem.create({
    data: {
      sourceId,
      sourceUrl: `https://example.com/ai-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      headline,
      excerpt,
      normalizedTitle: headline.toLowerCase(),
      categoryId,
    },
  });
  createdSourceItemIds.push(item.id);
  return item;
}

describe("createDraftFromItemAction — AI-written content (mocked provider)", () => {
  it("uses the AI-parsed headline/excerpt/blocks instead of the plain template when the AI call returns valid JSON", async () => {
    const editor = await createTestUser("EDITOR", "ai-draft-ok");
    trackUser(editor.id);
    await loginAs(editor.id);

    generateWithAIMock.mockResolvedValueOnce(
      JSON.stringify({
        headline: "AI-Written Headline For Test",
        excerpt: "AI-written excerpt summarizing the story.",
        blocks: [
          { type: "heading", level: 2, text: "What Happened" },
          { type: "paragraph", text: "AI-written paragraph body." },
          { type: "heading", level: 2, text: "Why It Matters" },
          { type: "paragraph", text: "AI-written significance paragraph." },
        ],
      })
    );

    const item = await makeItem("Original discovered headline", "Original discovered excerpt.");
    const draft = await createDraftFromItemAction(item.id);
    expect(draft.ok).toBe(true);
    trackArticle(draft.articleId!);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: draft.articleId! } });
    expect(article.title).toBe("AI-Written Headline For Test");
    expect(article.excerpt).toBe("AI-written excerpt summarizing the story.");
    const content = article.content as { blocks: { type: string; text: string }[] };
    expect(content.blocks.map((b) => b.text)).toContain("AI-written paragraph body.");
    expect(content.blocks.map((b) => b.text)).toContain("AI-written significance paragraph.");

    clearSession();
  });

  it("falls back to the plain template when the AI call succeeds but returns unparseable output", async () => {
    const editor = await createTestUser("EDITOR", "ai-draft-garbage");
    trackUser(editor.id);
    await loginAs(editor.id);

    generateWithAIMock.mockResolvedValueOnce("not valid JSON at all");

    const item = await makeItem("Fallback headline", "Fallback excerpt.");
    const draft = await createDraftFromItemAction(item.id);
    expect(draft.ok).toBe(true);
    trackArticle(draft.articleId!);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: draft.articleId! } });
    // Same plain-template shape createDraftFromItemAction has always used
    // when AI isn't configured — proves a bad AI response degrades safely
    // rather than publishing garbage or blocking the draft entirely.
    expect(article.title).toBe("Fallback headline");
    expect(article.excerpt).toBe("Fallback excerpt.");
    const content = article.content as { blocks: { type: string; text: string }[] };
    expect(content.blocks.map((b) => b.text)).toContain("What Happened");
    expect(content.blocks.map((b) => b.text)).toContain("Why It Matters");

    clearSession();
  });
});
