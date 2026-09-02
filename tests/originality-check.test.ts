import { describe, it, expect } from "vitest";
import {
  shingleSet,
  shingleSimilarity,
  checkOriginality,
  ORIGINALITY_BLOCK_THRESHOLD,
} from "../lib/ai/originality-check";
import type { ContentBlock } from "../lib/content-blocks";

describe("shingleSet", () => {
  it("builds lowercase n-gram shingles", () => {
    const set = shingleSet("The Quick Brown Fox Jumps Over", 5);
    expect(set.has("the quick brown fox jumps")).toBe(true);
    expect(set.has("quick brown fox jumps over")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("returns an empty set when there are fewer words than n", () => {
    expect(shingleSet("too short", 5).size).toBe(0);
  });

  it("strips punctuation but keeps apostrophes", () => {
    const set = shingleSet("It's, a test: of punctuation-stripping now!", 5);
    expect(set.has("it's a test of punctuation")).toBe(true);
  });
});

describe("shingleSimilarity", () => {
  it("scores near-identical text highly", () => {
    const a = "The company announced a new smartphone today with a faster processor and better camera system.";
    const b = "The company announced a new smartphone today with a faster processor and improved camera system.";
    expect(shingleSimilarity(a, b, 5)).toBeGreaterThan(0.5);
  });

  it("scores a genuinely reworded paraphrase low", () => {
    const a = "The company announced a new smartphone today with a faster processor and better camera system.";
    const b = "During a press event, the firm unveiled its latest handset, touting improved performance and photography.";
    expect(shingleSimilarity(a, b, 5)).toBeLessThan(ORIGINALITY_BLOCK_THRESHOLD);
  });

  it("returns 0 for empty or too-short inputs without crashing", () => {
    expect(shingleSimilarity("", "some real text here that is long enough", 5)).toBe(0);
    expect(shingleSimilarity("short", "short", 5)).toBe(0);
    expect(shingleSimilarity("", "", 5)).toBe(0);
  });

  it("returns 1 when the two texts are identical and long enough", () => {
    const text = "One two three four five six seven eight nine ten.";
    expect(shingleSimilarity(text, text, 5)).toBe(1);
  });
});

describe("checkOriginality", () => {
  const nearVerbatimBlocks: ContentBlock[] = [
    { type: "paragraph", text: "The company announced a new smartphone today with a faster processor and better camera system." },
    { type: "paragraph", text: "Executives said the device will ship next month at a competitive price point." },
  ];

  const originalBlocks: ContentBlock[] = [
    { type: "paragraph", text: "During a press event, the firm unveiled its latest handset, touting improved performance and photography." },
    { type: "paragraph", text: "Leadership indicated availability is planned for the coming weeks at an accessible cost." },
  ];

  it("flags a near-verbatim draft against its source with a high score and correct label", () => {
    const result = checkOriginality(nearVerbatimBlocks, [
      { label: "primary", text: "The company announced a new smartphone today with a faster processor and better camera system. Executives said the device will ship next month at a competitive price point." },
    ]);
    expect(result.score).toBeGreaterThanOrEqual(ORIGINALITY_BLOCK_THRESHOLD);
    expect(result.matchedAgainst).toBe("primary");
  });

  it("does not flag a genuinely original draft against its source", () => {
    const result = checkOriginality(originalBlocks, [
      { label: "primary", text: "The company announced a new smartphone today with a faster processor and better camera system. Executives said the device will ship next month at a competitive price point." },
    ]);
    expect(result.score).toBeLessThan(ORIGINALITY_BLOCK_THRESHOLD);
  });

  it("picks the higher-scoring source and reports its label", () => {
    const result = checkOriginality(nearVerbatimBlocks, [
      { label: "primary", text: "Completely unrelated text about an entirely different subject with no overlapping phrasing whatsoever." },
      { label: "secondary", text: "The company announced a new smartphone today with a faster processor and better camera system. Executives said the device will ship next month at a competitive price point." },
    ]);
    expect(result.matchedAgainst).toBe("secondary");
    expect(result.score).toBeGreaterThanOrEqual(ORIGINALITY_BLOCK_THRESHOLD);
  });

  it("returns a zero score with no match when no source texts are supplied", () => {
    const result = checkOriginality(originalBlocks, []);
    expect(result).toEqual({ score: 0, matchedAgainst: null });
  });

  it("handles list, heading, quote, and image blocks without crashing", () => {
    const blocks: ContentBlock[] = [
      { type: "heading", level: 2, text: "A New Development" },
      { type: "list", style: "bullet", items: ["First point here", "Second point here"] },
      { type: "quote", text: "This is a quoted remark from an official." },
      { type: "image", url: "https://example.test/img.jpg", alt: "A descriptive alt text" },
    ];
    const result = checkOriginality(blocks, [{ label: "primary", text: "Some unrelated source text about a different topic entirely." }]);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
