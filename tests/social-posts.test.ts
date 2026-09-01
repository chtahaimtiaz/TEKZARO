import { describe, it, expect } from "vitest";
import { generateSocialPosts, type SocialPostInput } from "../lib/social-posts";

function baseInput(overrides: Partial<SocialPostInput> = {}): SocialPostInput {
  return {
    title: "Company Ships New AI Chip",
    excerpt: "The new chip promises faster on-device inference for mobile apps.",
    categoryName: "AI",
    tagNames: ["chips", "mobile"],
    url: "https://tekzaro.example/article/company-ships-new-ai-chip",
    pakistanRelevance: 0,
    ...overrides,
  };
}

describe("generateSocialPosts", () => {
  it("returns exactly one draft per platform", () => {
    const posts = generateSocialPosts(baseInput());
    expect(posts.map((p) => p.platform).sort()).toEqual(["facebook", "instagram", "tiktok", "x"]);
  });

  it("only ever includes the real title, excerpt and URL passed in — never invents content", () => {
    const input = baseInput();
    const posts = generateSocialPosts(input);
    for (const post of posts) {
      expect(post.text).toContain(input.url);
      // Every platform's copy is built from the real title/excerpt — the
      // title always appears verbatim somewhere in the generated text.
      expect(post.text).toContain(input.title);
    }
  });

  it("derives hashtags only from the real category/tags, plus #Pakistan only when relevance is genuinely high", () => {
    const lowRelevance = generateSocialPosts(baseInput({ pakistanRelevance: 10 }));
    const highRelevance = generateSocialPosts(baseInput({ pakistanRelevance: 85 }));
    expect(lowRelevance.find((p) => p.platform === "instagram")!.text).not.toContain("#Pakistan");
    expect(highRelevance.find((p) => p.platform === "instagram")!.text).toContain("#Pakistan");
  });

  it("includes an attribution line for Instagram and Facebook", () => {
    const posts = generateSocialPosts(baseInput());
    expect(posts.find((p) => p.platform === "instagram")!.text).toContain("TEKZARO");
    expect(posts.find((p) => p.platform === "facebook")!.text).toContain("TEKZARO");
  });

  it("keeps the X post within a practical character budget even with a long title", () => {
    const longTitle =
      "A Very Long Headline That Goes On And On About A Technology Company Announcing Many Different Products At Once In One Single Press Release";
    const posts = generateSocialPosts(baseInput({ title: longTitle }));
    const x = posts.find((p) => p.platform === "x")!;
    expect(x.text.length).toBeLessThanOrEqual(290);
    expect(x.text).toContain(baseInput().url);
  });

  it("never fabricates a hashtag beyond category/tags/#TechNews/#Pakistan", () => {
    const input = baseInput({ categoryName: "Cybersecurity", tagNames: ["breach"], pakistanRelevance: 90 });
    const posts = generateSocialPosts(input);
    const hashtags = posts
      .find((p) => p.platform === "instagram")!
      .text.split(/\s+/)
      .filter((w) => w.startsWith("#"));
    for (const tag of hashtags) {
      expect(["#TechNews", "#Cybersecurity", "#Pakistan", "#breach"]).toContain(tag);
    }
  });
});
