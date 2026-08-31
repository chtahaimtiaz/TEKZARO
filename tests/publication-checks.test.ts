import { describe, it, expect } from "vitest";
import { evaluatePublicationChecks, allChecksPassed } from "../lib/publication-checks";

const baseInput = {
  title: "A properly long headline for testing",
  slug: "a-properly-long-headline-for-testing",
  categoryId: "cat-1",
  authorId: "author-1",
  blocks: [{ type: "paragraph" as const, text: "Real body text." }],
  featuredImageUrl: null,
  featuredImageAlt: null,
  metaDescription: "A meta description.",
  excerpt: null,
  slugAvailable: true,
};

describe("evaluatePublicationChecks", () => {
  it("passes every check for a well-formed article", () => {
    const checks = evaluatePublicationChecks(baseInput);
    expect(allChecksPassed(checks)).toBe(true);
    expect(checks).toHaveLength(7);
  });

  it("fails the title check when too short", () => {
    const checks = evaluatePublicationChecks({ ...baseInput, title: "Short" });
    expect(checks.find((c) => c.id === "title")!.passed).toBe(false);
  });

  it("fails the slug check on invalid characters", () => {
    const checks = evaluatePublicationChecks({ ...baseInput, slug: "Not A Valid Slug!" });
    expect(checks.find((c) => c.id === "slug")!.passed).toBe(false);
  });

  it("fails the slug check when slugAvailable is false", () => {
    const checks = evaluatePublicationChecks({ ...baseInput, slugAvailable: false });
    expect(checks.find((c) => c.id === "slug")!.passed).toBe(false);
  });

  it("fails category/author checks when unset", () => {
    const checks = evaluatePublicationChecks({ ...baseInput, categoryId: null, authorId: null });
    expect(checks.find((c) => c.id === "category")!.passed).toBe(false);
    expect(checks.find((c) => c.id === "author")!.passed).toBe(false);
  });

  it("fails the body check when there is no real text", () => {
    const checks = evaluatePublicationChecks({ ...baseInput, blocks: [{ type: "paragraph", text: "   " }] });
    expect(checks.find((c) => c.id === "body")!.passed).toBe(false);
  });

  it("fails the image-alt check only when an image URL exists without alt text", () => {
    const withImageNoAlt = evaluatePublicationChecks({ ...baseInput, featuredImageUrl: "https://example.com/x.jpg", featuredImageAlt: null });
    expect(withImageNoAlt.find((c) => c.id === "image-alt")!.passed).toBe(false);

    const noImage = evaluatePublicationChecks(baseInput);
    expect(noImage.find((c) => c.id === "image-alt")!.passed).toBe(true);

    const withImageAndAlt = evaluatePublicationChecks({ ...baseInput, featuredImageUrl: "https://example.com/x.jpg", featuredImageAlt: "Alt text" });
    expect(withImageAndAlt.find((c) => c.id === "image-alt")!.passed).toBe(true);
  });

  it("passes the SEO check via excerpt fallback when metaDescription is empty", () => {
    const checks = evaluatePublicationChecks({ ...baseInput, metaDescription: null, excerpt: "An excerpt." });
    expect(checks.find((c) => c.id === "seo")!.passed).toBe(true);
  });

  it("fails the SEO check when both metaDescription and excerpt are empty", () => {
    const checks = evaluatePublicationChecks({ ...baseInput, metaDescription: null, excerpt: null });
    expect(checks.find((c) => c.id === "seo")!.passed).toBe(false);
  });
});
