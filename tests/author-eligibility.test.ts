import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { isAuthorEligibleForCategory } from "../lib/author-eligibility-shared";
import { pickEligibleAuthor } from "../lib/author-eligibility";
import { createArticleAction, updateArticleAction, type ArticleFormInput } from "../lib/article-actions";
import { CAN_OVERRIDE_AUTHOR_ELIGIBILITY } from "../lib/permissions";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } from "./helpers";
import { slugify } from "../lib/slugify";

describe("isAuthorEligibleForCategory (pure)", () => {
  it("an empty eligibleCategoryIds list is eligible for any category", () => {
    expect(isAuthorEligibleForCategory([], "cat-1")).toBe(true);
    expect(isAuthorEligibleForCategory([], "cat-anything")).toBe(true);
  });

  it("a non-empty list is eligible only for listed categories", () => {
    expect(isAuthorEligibleForCategory(["cat-1", "cat-2"], "cat-1")).toBe(true);
    expect(isAuthorEligibleForCategory(["cat-1", "cat-2"], "cat-3")).toBe(false);
  });
});

describe("pickEligibleAuthor", () => {
  const createdAuthorIds: string[] = [];
  const createdCategoryIds: string[] = [];
  let deactivatedGeneralistIds: string[] = [];

  afterAll(async () => {
    if (createdAuthorIds.length) await prisma.author.deleteMany({ where: { id: { in: createdAuthorIds } } });
    if (createdCategoryIds.length) await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    if (deactivatedGeneralistIds.length) {
      await prisma.author.updateMany({ where: { id: { in: deactivatedGeneralistIds } }, data: { active: true } });
    }
  });

  async function makeCategory(label: string) {
    const category = await prisma.category.create({
      data: { name: `Elig ${label} ${Date.now()}-${Math.random()}`, slug: `elig-${label}-${Date.now()}-${Math.random()}` },
    });
    createdCategoryIds.push(category.id);
    return category;
  }

  it("picks a generalist author (zero category links) for any category", async () => {
    const category = await makeCategory("generalist-cat");
    const author = await prisma.author.create({
      data: { name: `Elig Generalist ${Date.now()}`, slug: `elig-generalist-${Date.now()}-${Math.random()}` },
    });
    createdAuthorIds.push(author.id);

    const picked = await pickEligibleAuthor(category.id);
    expect(picked).not.toBeNull();

    // Deactivate right away rather than leaving a live generalist author
    // sitting around for the rest of this file's run — a concurrently
    // running test file's own pickEligibleAuthor()/createDraftFromItemAction
    // call could otherwise "steal" this author for one of THEIR articles
    // (any generalist is eligible for any category), leaving a real,
    // untracked Article that blocks this describe block's own author
    // delete below with a dangling FK.
    await prisma.author.update({ where: { id: author.id }, data: { active: false } });
  });

  it("never picks an inactive author, even one explicitly eligible for the category", async () => {
    const category = await makeCategory("inactive-cat");
    const inactive = await prisma.author.create({
      data: {
        name: `Elig Inactive ${Date.now()}`,
        slug: `elig-inactive-${Date.now()}-${Math.random()}`,
        active: false,
        categories: { connect: [{ id: category.id }] },
      },
    });
    createdAuthorIds.push(inactive.id);

    const picked = await pickEligibleAuthor(category.id);
    expect(picked?.id).not.toBe(inactive.id);
  });

  it("returns null when zero active authors are eligible", async () => {
    const category = await makeCategory("none-eligible-cat");

    // The category is brand new, so no existing author's explicit list
    // could include it yet — eligibility reduces entirely to "is any
    // active author a generalist (zero category links)". Deactivate every
    // currently-active generalist for the duration of this one assertion.
    const activeGeneralists = await prisma.author.findMany({
      where: { active: true, categories: { none: {} } },
      select: { id: true },
    });
    deactivatedGeneralistIds = activeGeneralists.map((a) => a.id);
    if (deactivatedGeneralistIds.length) {
      await prisma.author.updateMany({ where: { id: { in: deactivatedGeneralistIds } }, data: { active: false } });
    }

    try {
      const picked = await pickEligibleAuthor(category.id);
      expect(picked).toBeNull();
    } finally {
      if (deactivatedGeneralistIds.length) {
        await prisma.author.updateMany({ where: { id: { in: deactivatedGeneralistIds } }, data: { active: true } });
        deactivatedGeneralistIds = [];
      }
    }
  });
});

describe("resolveAuthorEligibility via createArticleAction/updateArticleAction", () => {
  const createdArticleIds: string[] = [];
  const createdAuthorIds: string[] = [];
  const createdCategoryIds: string[] = [];

  afterAll(async () => {
    if (createdArticleIds.length) await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
    if (createdAuthorIds.length) await prisma.author.deleteMany({ where: { id: { in: createdAuthorIds } } });
    if (createdCategoryIds.length) await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    clearSession();
    await cleanupTestData();
  });

  async function makeRestrictedPair(label: string) {
    const allowedCategory = await prisma.category.create({
      data: { name: `Elig Allowed ${label} ${Date.now()}`, slug: `elig-allowed-${label}-${Date.now()}-${Math.random()}` },
    });
    const otherCategory = await prisma.category.create({
      data: { name: `Elig Other ${label} ${Date.now()}`, slug: `elig-other-${label}-${Date.now()}-${Math.random()}` },
    });
    createdCategoryIds.push(allowedCategory.id, otherCategory.id);
    const restrictedAuthor = await prisma.author.create({
      data: {
        name: `Elig Restricted ${label} ${Date.now()}`,
        slug: `elig-restricted-${label}-${Date.now()}-${Math.random()}`,
        categories: { connect: [{ id: allowedCategory.id }] },
      },
    });
    createdAuthorIds.push(restrictedAuthor.id);
    return { allowedCategory, otherCategory, restrictedAuthor };
  }

  function baseInput(overrides: Partial<ArticleFormInput>): ArticleFormInput {
    return {
      title: `Author eligibility test article ${Date.now()}-${Math.random()}`,
      slug: slugify(`author-eligibility-test-${Date.now()}-${Math.random()}`),
      subheadline: "",
      excerpt: "A test excerpt used for the SEO check.",
      blocks: [{ type: "paragraph", text: "Real body text." }],
      pakistanImpact: "",
      categoryId: "",
      authorId: "",
      tagNames: [],
      locationName: "",
      featuredImageUrl: "",
      featuredImageAlt: "",
      featuredImageCaption: "",
      featuredImageCredit: "",
      featuredMediaId: "",
      seoTitle: "",
      metaDescription: "",
      canonicalUrl: "",
      ogImage: "",
      isBreaking: false,
      featured: false,
      pakistanRelevance: 0,
      regionalRelevance: 0,
      globalSignificance: 0,
      scheduledAt: "",
      overrideAuthorEligibility: false,
      ...overrides,
    };
  }

  it("rejects an ineligible (author, category) pairing without override", async () => {
    const editor = await createTestUser("EDITOR", "elig-reject");
    trackUser(editor.id);
    await loginAs(editor.id);

    const { otherCategory, restrictedAuthor } = await makeRestrictedPair("reject");
    const result = await createArticleAction(baseInput({ categoryId: otherCategory.id, authorId: restrictedAuthor.id }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not eligible/i);
  });

  it("accepts with override from a CAN_OVERRIDE_AUTHOR_ELIGIBILITY role, and persists authorEligibilityOverridden", async () => {
    expect(CAN_OVERRIDE_AUTHOR_ELIGIBILITY).toContain("ADMIN");
    const admin = await createTestUser("ADMIN", "elig-override");
    trackUser(admin.id);
    await loginAs(admin.id);

    const { otherCategory, restrictedAuthor } = await makeRestrictedPair("override");
    const result = await createArticleAction(
      baseInput({ categoryId: otherCategory.id, authorId: restrictedAuthor.id, overrideAuthorEligibility: true }),
    );
    expect(result.ok).toBe(true);
    const articleId = result.data && "id" in result.data ? result.data.id : undefined;
    expect(articleId).toBeDefined();
    createdArticleIds.push(articleId!);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId! } });
    expect(article.authorEligibilityOverridden).toBe(true);
  });

  it("rejects an override attempt from a role without CAN_OVERRIDE_AUTHOR_ELIGIBILITY", async () => {
    expect(CAN_OVERRIDE_AUTHOR_ELIGIBILITY).not.toContain("EDITOR");
    const editor = await createTestUser("EDITOR", "elig-override-denied");
    trackUser(editor.id);
    await loginAs(editor.id);

    const { otherCategory, restrictedAuthor } = await makeRestrictedPair("denied");
    const result = await createArticleAction(
      baseInput({ categoryId: otherCategory.id, authorId: restrictedAuthor.id, overrideAuthorEligibility: true }),
    );
    expect(result.ok).toBe(false);
  });

  it("an unchanged, already-overridden pairing doesn't require re-ticking the checkbox on a later save", async () => {
    const admin = await createTestUser("ADMIN", "elig-persist-override");
    trackUser(admin.id);
    await loginAs(admin.id);

    const { otherCategory, restrictedAuthor } = await makeRestrictedPair("persist");
    const created = await createArticleAction(
      baseInput({ categoryId: otherCategory.id, authorId: restrictedAuthor.id, overrideAuthorEligibility: true }),
    );
    expect(created.ok).toBe(true);
    const articleId = created.data && "id" in created.data ? created.data.id : undefined;
    expect(articleId).toBeDefined();
    createdArticleIds.push(articleId!);

    // Save again WITHOUT re-checking the override box, same pairing — must
    // still succeed since the (authorId, categoryId) pair itself is unchanged.
    const updated = await updateArticleAction(
      articleId!,
      baseInput({
        categoryId: otherCategory.id,
        authorId: restrictedAuthor.id,
        overrideAuthorEligibility: false,
        title: `Updated title for eligibility persistence test ${Date.now()}`,
      }),
    );
    expect(updated.ok).toBe(true);
  });

  it("re-requires the checkbox when the pairing actually changes (not a carried-forward override)", async () => {
    const admin = await createTestUser("ADMIN", "elig-repairing");
    trackUser(admin.id);
    await loginAs(admin.id);

    const { otherCategory, restrictedAuthor } = await makeRestrictedPair("repairing");
    const created = await createArticleAction(
      baseInput({ categoryId: otherCategory.id, authorId: restrictedAuthor.id, overrideAuthorEligibility: true }),
    );
    expect(created.ok).toBe(true);
    const articleId = created.data && "id" in created.data ? created.data.id : undefined;
    expect(articleId).toBeDefined();
    createdArticleIds.push(articleId!);

    // A second, different ineligible category — the prior override doesn't
    // carry forward to a genuinely different pairing.
    const thirdCategory = await prisma.category.create({
      data: { name: `Elig Third repairing ${Date.now()}`, slug: `elig-third-repairing-${Date.now()}-${Math.random()}` },
    });
    createdCategoryIds.push(thirdCategory.id);

    const updated = await updateArticleAction(
      articleId!,
      baseInput({ categoryId: thirdCategory.id, authorId: restrictedAuthor.id, overrideAuthorEligibility: false }),
    );
    expect(updated.ok).toBe(false);
  });
});
