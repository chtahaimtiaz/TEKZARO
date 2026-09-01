import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from "../lib/category-actions";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData, captureRedirect } from "./helpers";

const createdCategoryIds: string[] = [];

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function asEditor() {
  const editor = await createTestUser("EDITOR", "category-actions");
  trackUser(editor.id);
  await loginAs(editor.id);
}

afterAll(async () => {
  if (createdCategoryIds.length) {
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  }
  clearSession();
  await cleanupTestData();
});

describe("createCategoryAction", () => {
  it("auto-derives a slug from the name and de-duplicates it on collision", async () => {
    await asEditor();
    const name = `Test Category ${Date.now()}`;

    await captureRedirect(() => createCategoryAction(formData({ name })));
    const first = await prisma.category.findUniqueOrThrow({ where: { name } });
    createdCategoryIds.push(first.id);

    // Same slug root, different name — must not collide with the first slug.
    const secondName = `${name} Extra`;
    await captureRedirect(() =>
      createCategoryAction(formData({ name: secondName, description: "" })),
    );
    const second = await prisma.category.findUniqueOrThrow({ where: { name: secondName } });
    createdCategoryIds.push(second.id);

    expect(second.slug).not.toBe(first.slug);
  });
});

describe("updateCategoryAction", () => {
  it("persists the quota/checklist fields and writes an audit log entry", async () => {
    await asEditor();
    const category = await prisma.category.create({
      data: { name: `Quota Test Category ${Date.now()}`, slug: `quota-test-category-${Date.now()}` },
    });
    createdCategoryIds.push(category.id);

    const fd = formData({
      dailyTarget: "3",
      minQualityNote: "Prefer hands-on reviews over press-release rewrites.",
    });
    fd.set("active", "on");
    fd.set("participatesInQuota", "on");
    // requirePrimarySourceVerification deliberately omitted — unchecked.

    await captureRedirect(() => updateCategoryAction(category.id, fd));

    const updated = await prisma.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(updated.dailyTarget).toBe(3);
    expect(updated.active).toBe(true);
    expect(updated.participatesInQuota).toBe(true);
    expect(updated.requirePrimarySourceVerification).toBe(false);
    expect(updated.minQualityNote).toBe("Prefer hands-on reviews over press-release rewrites.");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Category", entityId: category.id, action: "category_quota_updated" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.metadata as { dailyTarget?: number } | null)?.dailyTarget).toBe(3);
  });
});

describe("deleteCategoryAction", () => {
  it("refuses to delete a category still referenced by an Article, with a friendly redirect reason", async () => {
    await asEditor();
    const category = await prisma.category.create({
      data: { name: `In-Use Category ${Date.now()}`, slug: `in-use-category-${Date.now()}` },
    });
    createdCategoryIds.push(category.id);

    // Own dedicated author, not an arbitrary findFirstOrThrow() pick — see
    // the note in tests/cron-publish-scheduled.test.ts for why an unowned
    // lookup here can collide with another concurrently-running test
    // file's own fixture cleanup.
    const author = await prisma.author.create({
      data: {
        name: `Category Delete Test Author ${Date.now()}`,
        slug: `category-delete-test-author-${Date.now()}`,
        categories: { connect: [{ id: category.id }] },
      },
    });
    const article = await prisma.article.create({
      data: {
        slug: `category-delete-test-${Date.now()}`,
        title: "Category delete test article",
        content: { blocks: [] },
        status: "DRAFT",
        categoryId: category.id,
        authorId: author.id,
      },
    });

    try {
      const target = await captureRedirect(() => deleteCategoryAction(category.id));
      expect(target).toContain("error=");

      const stillExists = await prisma.category.findUnique({ where: { id: category.id } });
      expect(stillExists).not.toBeNull();
    } finally {
      await prisma.article.delete({ where: { id: article.id } });
      await prisma.author.delete({ where: { id: author.id } });
    }
  });
});
