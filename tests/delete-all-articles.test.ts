import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { deleteAllArticlesAction } from "../lib/article-actions";
import { prisma } from "../lib/prisma";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } from "./helpers";

let categoryId: string;
let authorId: string;

async function asAdmin() {
  const admin = await createTestUser("ADMIN", "delete-all-articles");
  trackUser(admin.id);
  await loginAs(admin.id);
}
async function asEditor() {
  const editor = await createTestUser("EDITOR", "delete-all-articles");
  trackUser(editor.id);
  await loginAs(editor.id);
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `Delete All Test Category ${Date.now()}`, slug: `delete-all-test-category-${Date.now()}` },
  });
  categoryId = category.id;
  const author = await prisma.author.create({
    data: { name: `Delete All Test Author ${Date.now()}`, slug: `delete-all-test-author-${Date.now()}` },
  });
  authorId = author.id;
});

afterAll(async () => {
  clearSession();
  await cleanupTestData();
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
});

// deleteAllArticlesAction's whole job is prisma.article.deleteMany({}) with
// NO where clause — by design, since it deletes every article system-wide.
// This suite runs against the same shared production database as every
// other test file in this project (not an isolated test DB), which holds
// real editorial content. A test that lets the real delete path actually
// execute would wipe that content on every future test run, forever. So
// prisma.article.deleteMany is mocked for the one test that reaches it —
// this still exercises the real auth/confirmation-phrase/logAction logic
// end to end, it just never lets the real bulk DELETE reach the database.
// The guard-clause tests (auth, wrong phrase) are safe unmocked, since
// deleteAllArticlesAction returns before ever calling deleteMany in both.
describe("deleteAllArticlesAction", () => {
  it("rejects an unauthenticated caller", async () => {
    clearSession();
    await expect(deleteAllArticlesAction("DELETE ALL ARTICLES")).rejects.toThrow();
  });

  it("rejects a non-ADMIN role (EDITOR)", async () => {
    await asEditor();
    await expect(deleteAllArticlesAction("DELETE ALL ARTICLES")).rejects.toThrow();
  });

  it("refuses without the exact confirmation phrase, deleting nothing", async () => {
    await asAdmin();
    const article = await prisma.article.create({
      data: {
        slug: `delete-all-test-${Date.now()}`,
        title: "Delete-all test article",
        content: { blocks: [{ type: "paragraph", text: "Body." }] },
        status: "DRAFT",
        categoryId,
        authorId,
      },
    });

    const wrongPhrase = await deleteAllArticlesAction("delete all articles");
    expect(wrongPhrase.ok).toBe(false);
    const empty = await deleteAllArticlesAction("");
    expect(empty.ok).toBe(false);

    const stillThere = await prisma.article.findUnique({ where: { id: article.id } });
    expect(stillThere).not.toBeNull();

    await prisma.article.delete({ where: { id: article.id } });
  });

  it("with the real deleteMany mocked out: counts correctly, calls deleteMany({}) with no filter, and logs the action", async () => {
    await asAdmin();
    const findManySpy = vi.spyOn(prisma.article, "findMany").mockResolvedValue([
      { id: "a", title: "One" },
      { id: "b", title: "Two" },
      { id: "c", title: "Three" },
    ] as never);
    const deleteManySpy = vi.spyOn(prisma.article, "deleteMany").mockResolvedValue({ count: 3 });

    const result = await deleteAllArticlesAction("DELETE ALL ARTICLES");

    expect(result.ok).toBe(true);
    expect(result.data?.count).toBe(3);
    expect(deleteManySpy).toHaveBeenCalledWith({});

    const audit = await prisma.auditLog.findFirst({ where: { action: "all_articles_deleted" }, orderBy: { createdAt: "desc" } });
    expect(audit).not.toBeNull();
    expect((audit?.metadata as { count?: number } | null)?.count).toBe(3);

    findManySpy.mockRestore();
    deleteManySpy.mockRestore();
  });
});
