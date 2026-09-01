import { describe, it, expect } from "vitest";
import { findBestDuplicateMatch, AUTO_MERGE_THRESHOLD, type DuplicateCandidate } from "../lib/discovery/duplicates";
import { computePriorityScore } from "../lib/discovery/priority";
import { classifyPakistanRelevance } from "../lib/discovery/pakistan-relevance";
import { classifyTechRelevance } from "../lib/discovery/tech-relevance";
import { normalizeTitle, normalizeUrlForDedup } from "../lib/ingestion/normalize";
import { generateHeadlineSuggestions } from "../lib/discovery/headlines";

function candidate(overrides: Partial<DuplicateCandidate>): DuplicateCandidate {
  return {
    id: "c1",
    clusterId: "cluster-1",
    sourceUrl: "https://a.example/story",
    canonicalUrl: null,
    normalizedTitle: normalizeTitle("Company Launches New AI Model"),
    sourceId: "source-a",
    publishedAt: new Date(),
    ...overrides,
  };
}

describe("findBestDuplicateMatch", () => {
  it("scores an exact canonical URL match as 1.0", () => {
    const match = findBestDuplicateMatch(
      { sourceUrl: "https://b.example/x", canonicalUrl: "https://a.example/story", normalizedTitle: "irrelevant", sourceId: "source-b", publishedAt: new Date() },
      [candidate({ canonicalUrl: "https://a.example/story" })],
    );
    expect(match?.score).toBe(1);
  });

  it("scores an exact source URL match as 1.0", () => {
    const match = findBestDuplicateMatch(
      { sourceUrl: "https://a.example/story", normalizedTitle: "irrelevant", sourceId: "source-a", publishedAt: new Date() },
      [candidate({})],
    );
    expect(match?.score).toBe(1);
  });

  it("merges genuinely similar titles from a different source above the auto-merge threshold", () => {
    const match = findBestDuplicateMatch(
      {
        sourceUrl: "https://c.example/other-story",
        normalizedTitle: normalizeTitle("Company Unveils New AI Model"),
        sourceId: "source-c",
        publishedAt: new Date(),
      },
      [candidate({})],
    );
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThanOrEqual(AUTO_MERGE_THRESHOLD);
  });

  it("returns null for genuinely unrelated titles", () => {
    const match = findBestDuplicateMatch(
      {
        sourceUrl: "https://c.example/unrelated",
        normalizedTitle: normalizeTitle("Startup Raises Funding Round For Robotics"),
        sourceId: "source-c",
        publishedAt: new Date(),
      },
      [candidate({})],
    );
    expect(match).toBeNull();
  });

  it("matches the same story across tracking-parameter URL variants", () => {
    const match = findBestDuplicateMatch(
      {
        sourceUrl: "https://a.example/story?utm_source=twitter&utm_medium=social&fbclid=abc123",
        normalizedTitle: "irrelevant",
        sourceId: "source-b",
        publishedAt: new Date(),
      },
      [candidate({ sourceUrl: "https://a.example/story" })],
    );
    expect(match?.score).toBe(1);
    expect(match?.reason).toBe("Exact source URL match");
  });

  it("never returns a score below the possible-duplicate threshold", () => {
    const candidates = [
      candidate({ normalizedTitle: normalizeTitle("Completely Different Topic About Gaming Consoles") }),
    ];
    const match = findBestDuplicateMatch(
      { sourceUrl: "https://z.example/z", normalizedTitle: normalizeTitle("Company Launches New AI Model"), sourceId: "z", publishedAt: new Date() },
      candidates,
    );
    // Either null, or above threshold — never a silent low-confidence auto-decision.
    if (match) expect(match.score).toBeGreaterThanOrEqual(0.45);
  });
});

describe("computePriorityScore", () => {
  it("gives every point a plain-English reason — never a mysterious number", () => {
    const result = computePriorityScore({
      sourceTier: "TIER_1",
      publishedAt: new Date(),
      pakistanRelevance: 80,
      corroboratingSourceCount: 2,
      headline: "Breaking: Company Launches Product",
      matchedPriorityKeywords: ["5G"],
      techRelevance: { score: 3, reasons: ['Mentions "5g"'] },
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.length).toBeGreaterThanOrEqual(5);
    expect(result.reasons.some((r) => r.includes("Tier 1"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("breaking"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("5G"))).toBe(true);
  });

  it("ranks a Tier 1 recent story above a Tier 3 old one, all else equal", () => {
    const strong = computePriorityScore({
      sourceTier: "TIER_1",
      publishedAt: new Date(),
      pakistanRelevance: 0,
      corroboratingSourceCount: 0,
      headline: "Plain headline",
      matchedPriorityKeywords: [],
      techRelevance: { score: 0, reasons: [] },
    });
    const weak = computePriorityScore({
      sourceTier: "TIER_3",
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
      pakistanRelevance: 0,
      corroboratingSourceCount: 0,
      headline: "Plain headline",
      matchedPriorityKeywords: [],
      techRelevance: { score: 0, reasons: [] },
    });
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("heavily deprioritizes a story with zero technology signal below one with genuine tech relevance", () => {
    const techStory = computePriorityScore({
      sourceTier: "TIER_2",
      publishedAt: new Date(),
      pakistanRelevance: 0,
      corroboratingSourceCount: 0,
      headline: "Company ships new chip",
      matchedPriorityKeywords: [],
      techRelevance: { score: 3, reasons: ['Mentions "chip"'] },
    });
    const offTopicStory = computePriorityScore({
      sourceTier: "TIER_2",
      publishedAt: new Date(),
      pakistanRelevance: 0,
      corroboratingSourceCount: 0,
      headline: "Local team wins championship match",
      matchedPriorityKeywords: [],
      techRelevance: { score: 0, reasons: [] },
    });
    expect(techStory.score).toBeGreaterThan(offTopicStory.score);
    expect(offTopicStory.reasons.some((r) => r.toLowerCase().includes("deprioritized"))).toBe(true);
  });
});

describe("classifyTechRelevance", () => {
  it("scores zero for text with no technology signal", () => {
    const result = classifyTechRelevance("Local team wins championship match after dramatic final.", []);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("matches a built-in technology term with a visible reason", () => {
    const result = classifyTechRelevance("A new smartphone launches with an improved processor.", []);
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("scores higher with a configured priority TOPIC keyword than without", () => {
    const withoutKeyword = classifyTechRelevance("Company announces a new rollout plan.", []);
    const withKeyword = classifyTechRelevance("Company announces a new rollout plan.", [
      { term: "rollout plan", type: "TOPIC", priority: true },
    ]);
    expect(withKeyword.score).toBeGreaterThan(withoutKeyword.score);
  });
});

describe("normalizeUrlForDedup", () => {
  it("strips common tracking query params", () => {
    const normalized = normalizeUrlForDedup("https://a.example/story?utm_source=x&utm_medium=y&fbclid=z&gclid=w");
    expect(normalized).toBe("https://a.example/story");
  });

  it("keeps genuine, non-tracking query params", () => {
    const normalized = normalizeUrlForDedup("https://a.example/story?id=123&utm_source=x");
    expect(normalized).toBe("https://a.example/story?id=123");
  });

  it("strips a trailing slash and fragment", () => {
    expect(normalizeUrlForDedup("https://a.example/story/#section")).toBe("https://a.example/story");
  });

  it("returns the original string unchanged for a malformed URL, never throws", () => {
    expect(normalizeUrlForDedup("not a url")).toBe("not a url");
  });
});

describe("classifyPakistanRelevance", () => {
  it("classifies NONE for text with no Pakistan signal", () => {
    const result = classifyPakistanRelevance("A global chipmaker announces a new processor.", []);
    expect(result.level).toBe("NONE");
    expect(result.reasons).toEqual([]);
  });

  it("classifies at least LOW/MODERATE for a direct Pakistan mention, with a visible reason", () => {
    const result = classifyPakistanRelevance("A new phone launches in Pakistan with local pricing announced.", []);
    expect(result.level).not.toBe("NONE");
    expect(result.reasons.some((r) => r.toLowerCase().includes("pakistan"))).toBe(true);
  });

  it("does not treat popularity/engagement words as a relevance signal", () => {
    const result = classifyPakistanRelevance("This story is trending and viral with millions of views worldwide.", []);
    expect(result.level).toBe("NONE");
  });

  it("scores higher with configured priority keywords than without", () => {
    const withoutKeyword = classifyPakistanRelevance("Company announces a new 5G rollout plan.", []);
    const withKeyword = classifyPakistanRelevance("Company announces a new 5G rollout plan.", [
      { term: "5G", type: "TOPIC", priority: true },
    ]);
    expect(withKeyword.score).toBeGreaterThan(withoutKeyword.score);
  });
});

describe("generateHeadlineSuggestions", () => {
  it("always returns exactly 5 distinctly-labeled, non-empty suggestions", () => {
    const suggestions = generateHeadlineSuggestions("Company Launches New AI Model For Developers", "It ships next week to all customers.");
    expect(suggestions).toHaveLength(5);
    for (const s of suggestions) {
      expect(s.headline.length).toBeGreaterThan(0);
    }
    expect(new Set(suggestions.map((s) => s.style)).size).toBe(5);
  });

  it("strips a trailing RSS source suffix from the straight headline", () => {
    const suggestions = generateHeadlineSuggestions("Company Launches New Product - TechCrunch");
    const straight = suggestions.find((s) => s.style === "straight")!;
    expect(straight.headline).toBe("Company Launches New Product");
  });

  it("keeps the short/mobile variant within a reasonable length", () => {
    const longTitle = "A Very Long Headline That Goes On And On About A Technology Company Announcing Many Different Products At Once";
    const suggestions = generateHeadlineSuggestions(longTitle);
    const short = suggestions.find((s) => s.style === "short")!;
    expect(short.headline.length).toBeLessThanOrEqual(61); // 60 + possible ellipsis char
  });
});
