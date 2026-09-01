import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { createCategoryAction, deleteCategoryAction } from "../lib/category-actions";
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

describe("deleteCategoryAction", () => {
  it("refuses to delete a category still referenced by an Article, with a friendly redirect reason", async () => {
    await asEditor();
    const category = await prisma.category.create({
      data: { name: `In-Use Category ${Date.now()}`, slug: `in-use-category-${Date.now()}` },
    });
    createdCategoryIds.push(category.id);

    const author = await prisma.author.findFirstOrThrow();
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
    }
  });
});
