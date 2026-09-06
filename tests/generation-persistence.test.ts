import { describe, it, expect } from "vitest";
import { countWords, countHeadings } from "../lib/ai/generation-persistence";
import type { ContentBlock } from "../lib/content-blocks";

describe("countWords", () => {
  it("counts words across paragraph, list, quote and heading blocks", () => {
    const blocks: ContentBlock[] = [
      { type: "heading", level: 2, text: "A heading" },
      { type: "paragraph", text: "Four words right here" },
      { type: "list", style: "bullet", items: ["two words", "three more words"] },
      { type: "quote", text: "Three word quote" },
    ];
    // heading text is excluded from the word count (headings are structure,
    // not body prose); every other block type contributes its words.
    expect(countWords(blocks)).toBe(4 + 2 + 3 + 3);
  });

  it("counts words inside fact-table rows and FAQ answers, not just prose", () => {
    const withTable: ContentBlock[] = [{ type: "fact-table", rows: [{ label: "Price", value: "Nine nine nine dollars" }] }];
    const withFaq: ContentBlock[] = [{ type: "faq", items: [{ question: "Is it fast", answer: "Yes very fast indeed" }] }];
    expect(countWords(withTable)).toBeGreaterThan(0);
    expect(countWords(withFaq)).toBeGreaterThan(0);
  });
});

describe("countHeadings", () => {
  it("counts only heading blocks", () => {
    const blocks: ContentBlock[] = [
      { type: "heading", level: 2, text: "One" },
      { type: "paragraph", text: "Body text" },
      { type: "heading", level: 3, text: "Two" },
      { type: "fact-table", rows: [{ label: "a", value: "b" }] },
    ];
    expect(countHeadings(blocks)).toBe(2);
  });
});
