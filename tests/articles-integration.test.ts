import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { createArticleAction, updateArticleAction, transitionArticleAction, type ArticleFormInput } from "../lib/article-actions";
import { ForbiddenError } from "../lib/auth";
import { createTestUser, loginAs, clearSession, trackArticle, trackUser, cleanupTestData } from "./helpers";
import { slugify } from "../lib/slugify";

let categoryId: string;
let authorId: string;

function baseInput(title: string): ArticleFormInput {
  return {
    title,
    slug: slugify(title),
    subheadline: "A test subheadline",
    excerpt: "A test excerpt used for the SEO check.",
    blocks: [{ type: "paragraph", text: "Real article body text for testing." }],
    pakistanImpact: "",
    categoryId,
    authorId,
    tagNames: ["Test"],
    locationName: "",
    featuredImageUrl: "",
    featuredImageAlt: "",
    featuredImageCaption: "",
    featuredImageCredit: "",
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
  };
}

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow();
  const author = await prisma.author.findFirstOrThrow();
  categoryId = category.id;
  authorId = author.id;
});

afterAll(async () => {
  clearSession();
  await cleanupTestData();
});

describe("article creation and slug uniqueness", () => {
  it("never silently collides slugs — a duplicate title gets a numeric suffix", async () => {
    const reporter = await createTestUser("REPORTER", "slugtest");
    trackUser(reporter.id);
    await loginAs(reporter.id);

    const title = `Duplicate Title Test ${Date.now()}`;
    const first = await createArticleAction(baseInput(title));
    expect(first.ok).toBe(true);
    trackArticle(first.data!.id);

    const second = await createArticleAction(baseInput(title));
    expect(second.ok).toBe(true);
    trackArticle(second.data!.id);

    expect(second.data!.slug).not.toBe(first.data!.slug);
    expect(second.data!.slug.startsWith(first.data!.slug)).toBe(true);

    clearSession();
  });
});

describe("full review -> publish workflow", () => {
  it("takes a draft through submit -> approve -> publish, versioning every step, and blocks reporters from publishing", async () => {
    const reporter = await createTestUser("REPORTER", "workflow");
    const editor = await createTestUser("EDITOR", "workflow");
    trackUser(reporter.id);
    trackUser(editor.id);

    await loginAs(reporter.id);
    const created = await createArticleAction(baseInput(`Workflow Test Article ${Date.now()}`));
    expect(created.ok).toBe(true);
    const articleId = created.data!.id;
    trackArticle(articleId);

    let article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(article.status).toBe("DRAFT");
    expect(article.createdById).toBe(reporter.id);

    // Unauthorized: a REPORTER cannot publish, even their own article, even
    // by calling the server action directly (not through any UI button).
    const unauthorizedPublish = await transitionArticleAction(articleId, "publish");
    expect(unauthorizedPublish.ok).toBe(false);

    const submitted = await transitionArticleAction(articleId, "submit");
    expect(submitted.ok).toBe(true);
    article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(article.status).toBe("IN_REVIEW");

    // A different reporter cannot touch this draft.
    const otherReporter = await createTestUser("REPORTER", "other");
    trackUser(otherReporter.id);
    await loginAs(otherReporter.id);
    await expect(updateArticleAction(articleId, baseInput("Hijacked title"))).rejects.toThrow(ForbiddenError);

    await loginAs(editor.id);
    const approved = await transitionArticleAction(articleId, "approve");
    expect(approved.ok).toBe(true);

    const published = await transitionArticleAction(articleId, "publish");
    expect(published.ok).toBe(true);
    article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(article.status).toBe("PUBLISHED");
    expect(article.publishedAt).not.toBeNull();

    const versions = await prisma.articleVersion.findMany({
      where: { articleId },
      orderBy: { versionNumber: "asc" },
    });
    // created, submit, approve, publish
    expect(versions.length).toBeGreaterThanOrEqual(4);
    expect(versions.map((v) => v.versionNumber)).toEqual(versions.map((_, i) => i + 1));
    expect(versions.at(-1)!.status).toBe("PUBLISHED");

    clearSession();
  });

  it("rejects publish when a required field is missing", async () => {
    const editor = await createTestUser("EDITOR", "checks");
    trackUser(editor.id);
    await loginAs(editor.id);

    const input = baseInput(`Incomplete Article ${Date.now()}`);
    input.excerpt = ""; // remove the only SEO-description source
    input.metaDescription = "";
    const created = await createArticleAction(input);
    expect(created.ok).toBe(true);
    const articleId = created.data!.id;
    trackArticle(articleId);

    await transitionArticleAction(articleId, "submit");
    await transitionArticleAction(articleId, "approve");
    const publishResult = await transitionArticleAction(articleId, "publish");

    expect(publishResult.ok).toBe(false);
    expect(publishResult.error).toMatch(/SEO/i);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(article.status).toBe("APPROVED"); // unchanged — publish was rejected

    clearSession();
  });
});

describe("demo article handling", () => {
  it("preserves isDemo through an editorial edit", async () => {
    // A disposable demo-flagged article of our own — never touch the real
    // seeded demo content directly, since updateArticleAction overwrites
    // `content` wholesale and we don't want to clobber the seed data.
    const disposableDemo = await prisma.article.create({
      data: {
        slug: `test-demo-article-${Date.now()}`,
        title: "Disposable Demo Article For Testing",
        content: { blocks: [{ type: "paragraph", text: "Original demo text." }] },
        status: "DRAFT",
        isDemo: true,
        categoryId,
        authorId,
      },
    });
    trackArticle(disposableDemo.id);

    const editor = await createTestUser("EDITOR", "demo-edit");
    trackUser(editor.id);
    await loginAs(editor.id);

    const input = baseInput(disposableDemo.title);
    input.slug = disposableDemo.slug;
    const result = await updateArticleAction(disposableDemo.id, input);
    expect(result.ok).toBe(true);

    const reloaded = await prisma.article.findUniqueOrThrow({ where: { id: disposableDemo.id } });
    expect(reloaded.isDemo).toBe(true);

    clearSession();
  });
});
