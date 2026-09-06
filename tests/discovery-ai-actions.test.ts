import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const verifySourceItemMock = vi.fn();
vi.mock("../lib/verification-actions", () => ({
  verifySourceItem: verifySourceItemMock,
  UNCATEGORIZED_CATEGORY_SLUG: "uncategorized",
}));

const { writeWithAIAction } = await import("../lib/discovery-ai-actions");
const { prisma } = await import("../lib/prisma");
const { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } = await import("./helpers");

const createdSourceIds: string[] = [];
const createdItemIds: string[] = [];

async function makeSourceItem(aiStatus: "NOT_STARTED" | "PROCESSING" | "COMPLETE" | "FAILED" = "NOT_STARTED") {
  const source = await prisma.source.create({
    data: { name: `Write-with-AI test source ${Date.now()}-${Math.random()}`, url: "https://wwai-test.test", type: "RSS", tier: "TIER_2" },
  });
  createdSourceIds.push(source.id);
  const item = await prisma.sourceItem.create({
    data: {
      sourceId: source.id,
      sourceUrl: `https://wwai-test.test/story-${Date.now()}-${Math.random()}`,
      headline: "A headline for the write-with-AI action test",
      normalizedTitle: "a headline for the write-with-ai action test",
      status: "NEW",
      aiStatus,
    },
  });
  createdItemIds.push(item.id);
  return item;
}

beforeEach(() => vi.clearAllMocks());
afterAll(async () => {
  if (createdItemIds.length) await prisma.sourceItem.deleteMany({ where: { id: { in: createdItemIds } } });
  if (createdSourceIds.length) await prisma.source.deleteMany({ where: { id: { in: createdSourceIds } } });
  clearSession();
  await cleanupTestData();
});

describe("writeWithAIAction", () => {
  it("requires the CAN_CREATE_DRAFT_FROM_DISCOVERY permission", async () => {
    const reporter = await createTestUser("REPORTER", "wwai-forbidden");
    trackUser(reporter.id);
    await loginAs(reporter.id);
    const item = await makeSourceItem();
    await expect(writeWithAIAction(item.id)).rejects.toThrow();
  });

  it("claims the item (aiStatus -> PROCESSING -> COMPLETE) and returns the new articleId on success", async () => {
    const editor = await createTestUser("EDITOR", "wwai-success");
    trackUser(editor.id);
    await loginAs(editor.id);
    const item = await makeSourceItem();

    verifySourceItemMock.mockResolvedValue({ ok: true, articleId: "article-123", published: false });

    const result = await writeWithAIAction(item.id);
    expect(result.ok).toBe(true);
    expect(result.articleId).toBe("article-123");
    expect(verifySourceItemMock).toHaveBeenCalledWith({ itemId: item.id, actorId: editor.id, triggerType: "write_with_ai" });

    const updated = await prisma.sourceItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.aiStatus).toBe("COMPLETE");
  });

  it("refuses a second call while one is already PROCESSING, without ever invoking the pipeline", async () => {
    const editor = await createTestUser("EDITOR", "wwai-concurrent");
    trackUser(editor.id);
    await loginAs(editor.id);
    const item = await makeSourceItem("PROCESSING");

    const result = await writeWithAIAction(item.id);
    expect(result.ok).toBe(false);
    expect(result.alreadyRunning).toBe(true);
    expect(verifySourceItemMock).not.toHaveBeenCalled();
  });

  it("sets aiStatus to FAILED, not stuck at PROCESSING, when the pipeline returns a failure", async () => {
    const editor = await createTestUser("EDITOR", "wwai-pipeline-failure");
    trackUser(editor.id);
    await loginAs(editor.id);
    const item = await makeSourceItem();

    verifySourceItemMock.mockResolvedValue({ ok: false, error: "No draft could be produced." });

    const result = await writeWithAIAction(item.id);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("No draft could be produced.");

    const updated = await prisma.sourceItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.aiStatus).toBe("FAILED");
  });

  it("sets aiStatus to FAILED, not stuck at PROCESSING, when the pipeline throws unexpectedly", async () => {
    const editor = await createTestUser("EDITOR", "wwai-throws");
    trackUser(editor.id);
    await loginAs(editor.id);
    const item = await makeSourceItem();

    verifySourceItemMock.mockRejectedValue(new Error("Unexpected network failure"));

    const result = await writeWithAIAction(item.id);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unexpected network failure/);

    const updated = await prisma.sourceItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.aiStatus).toBe("FAILED");
  });

  it("allows a fresh call once a previous generation has already completed — Generate New Version", async () => {
    const editor = await createTestUser("EDITOR", "wwai-regenerate");
    trackUser(editor.id);
    await loginAs(editor.id);
    const item = await makeSourceItem("COMPLETE");

    verifySourceItemMock.mockResolvedValue({ ok: true, articleId: "article-456", published: false });
    const result = await writeWithAIAction(item.id);
    expect(result.ok).toBe(true);
    expect(verifySourceItemMock).toHaveBeenCalled();
  });

  it("allows a fresh call after a previous attempt failed", async () => {
    const editor = await createTestUser("EDITOR", "wwai-retry-after-fail");
    trackUser(editor.id);
    await loginAs(editor.id);
    const item = await makeSourceItem("FAILED");

    verifySourceItemMock.mockResolvedValue({ ok: true, articleId: "article-789", published: false });
    const result = await writeWithAIAction(item.id);
    expect(result.ok).toBe(true);
  });
});
