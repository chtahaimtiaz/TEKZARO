import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { notify } from "../lib/notifications";
import { createArticleAction, transitionArticleAction, type ArticleFormInput } from "../lib/article-actions";
import { createTestUser, loginAs, clearSession, trackArticle, trackUser, cleanupTestData } from "./helpers";
import { slugify } from "../lib/slugify";

let categoryId: string;
let authorId: string;

afterAll(cleanupTestData);

describe("notify()", () => {
  it("always inserts an in-app Notification row", async () => {
    const user = await createTestUser("REPORTER", "notify-basic");
    trackUser(user.id);

    await notify({ userId: user.id, type: "test_event", title: "Test title", body: "Test body." });

    const n = await prisma.notification.findFirst({ where: { userId: user.id, type: "test_event" } });
    expect(n).not.toBeNull();
    expect(n?.read).toBe(false);
  });

  it("email:true with SMTP unconfigured in this environment doesn't throw and still creates the row", async () => {
    const user = await createTestUser("REPORTER", "notify-email-unconfigured");
    trackUser(user.id);

    await expect(
      notify({ userId: user.id, type: "test_event_email", title: "T", body: "B", email: true }),
    ).resolves.toBeUndefined();

    const n = await prisma.notification.findFirst({ where: { userId: user.id, type: "test_event_email" } });
    expect(n).not.toBeNull();
  });
});

describe("workflow transitions trigger notifications", () => {
  function baseInput(title: string): ArticleFormInput {
    return {
      title,
      slug: slugify(title),
      subheadline: "",
      excerpt: "A test excerpt used for the SEO check.",
      blocks: [{ type: "paragraph", text: "Real article body text for testing." }],
      pakistanImpact: "",
      categoryId,
      authorId,
      tagNames: [],
      locationName: "",
      featuredImageUrl: "https://example.com/image.jpg",
      featuredImageAlt: "Alt text",
      featuredImageCaption: "",
      featuredImageCredit: "",
      featuredMediaId: "",
      seoTitle: "",
      metaDescription: "A test meta description long enough to pass the check.",
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

  it("submitting for review notifies every active ADMIN/EDITOR", async () => {
    const category = await prisma.category.findFirstOrThrow();
    const author = await prisma.author.findFirstOrThrow();
    categoryId = category.id;
    authorId = author.id;

    const editor = await createTestUser("EDITOR", "notify-submit-editor");
    trackUser(editor.id);
    const reporter = await createTestUser("REPORTER", "notify-submit-reporter");
    trackUser(reporter.id);

    await loginAs(reporter.id);
    const created = await createArticleAction(baseInput(`Notify Submit Test ${Date.now()}`));
    if (!created.ok || !created.data) throw new Error(`setup failed: ${created.error}`);
    trackArticle(created.data.id);

    const result = await transitionArticleAction(created.data.id, "submit");
    expect(result.ok).toBe(true);
    clearSession();

    const notification = await prisma.notification.findFirst({
      where: { userId: editor.id, type: "article_submitted" },
    });
    expect(notification).not.toBeNull();

    // "submit" broadcasts to every active ADMIN/EDITOR in the DB — including
    // real, non-test accounts — so clean those up explicitly by link rather
    // than relying on cleanupTestData()'s test-user-scoped cleanup.
    await prisma.notification.deleteMany({ where: { link: `/admin/articles/${created.data.id}` } });
  });

  it("approving notifies the article's author (createdBy)", async () => {
    const editor = await createTestUser("EDITOR", "notify-approve-editor");
    trackUser(editor.id);
    const reporter = await createTestUser("REPORTER", "notify-approve-reporter");
    trackUser(reporter.id);

    await loginAs(reporter.id);
    const created = await createArticleAction(baseInput(`Notify Approve Test ${Date.now()}`));
    if (!created.ok || !created.data) throw new Error(`setup failed: ${created.error}`);
    trackArticle(created.data.id);
    await transitionArticleAction(created.data.id, "submit");
    clearSession();

    await loginAs(editor.id);
    const approveResult = await transitionArticleAction(created.data.id, "approve");
    expect(approveResult.ok).toBe(true);
    clearSession();

    const notification = await prisma.notification.findFirst({
      where: { userId: reporter.id, type: "article_approved" },
    });
    expect(notification).not.toBeNull();
  });
});
