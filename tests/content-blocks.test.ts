import { describe, it, expect } from "vitest";
import { blockPlainText, isCanvasBlock, splitCanvasBlocks, joinCanvasBlocks, sanitizeArticleBlocks, normalizeHeadlineComparison, isIngestionMetadataBlock } from "../lib/content-blocks";
import type { ContentBlock, StructuredBlockAnchor } from "../lib/content-blocks";

describe("blockPlainText", () => {
  it("returns the text field as-is for paragraph, heading, quote and pakistan-impact blocks", () => {
    expect(blockPlainText({ type: "paragraph", text: "a paragraph" })).toBe("a paragraph");
    expect(blockPlainText({ type: "heading", level: 2, text: "a heading" })).toBe("a heading");
    expect(blockPlainText({ type: "quote", text: "a quote" })).toBe("a quote");
    expect(blockPlainText({ type: "pakistan-impact", text: "an impact note" })).toBe("an impact note");
  });

  it("strips inline formatting marks before returning text", () => {
    expect(blockPlainText({ type: "paragraph", text: "This is **bold** text." })).toBe("This is bold text.");
    expect(blockPlainText({ type: "list", style: "bullet", items: ["**one**", "_two_"] })).toBe("one. two");
  });

  it("joins list items with a separator", () => {
    expect(blockPlainText({ type: "list", style: "bullet", items: ["one", "two"] })).toBe("one. two");
  });

  it("flattens fact-table rows into label: value pairs", () => {
    const block: ContentBlock = { type: "fact-table", rows: [{ label: "Price", value: "$999" }, { label: "Release", value: "March 2026" }] };
    expect(blockPlainText(block)).toBe("Price: $999. Release: March 2026");
  });

  it("flattens FAQ items into question-answer pairs", () => {
    const block: ContentBlock = { type: "faq", items: [{ question: "Is it available in Pakistan?", answer: "Not yet." }] };
    expect(blockPlainText(block)).toBe("Is it available in Pakistan? Not yet.");
  });

  it("returns alt text for an image block", () => {
    expect(blockPlainText({ type: "image", url: "https://x/y.jpg", alt: "a description" })).toBe("a description");
  });

  it("flattens a table block into row pipe-separated cells and strips inline formatting", () => {
    const block: ContentBlock = {
      type: "table",
      rows: [
        { cells: [{ text: "**Model**", isHeader: true }, { text: "**Price**", isHeader: true }] },
        { cells: [{ text: "Galaxy S26" }, { text: "$899" }] },
      ],
    };
    expect(blockPlainText(block)).toBe("Model | Price. Galaxy S26 | $899");
  });

  it("returns empty string for a divider block", () => {
    expect(blockPlainText({ type: "divider" })).toBe("");
  });
});

describe("isCanvasBlock", () => {
  it("classifies paragraph/heading/quote/list/image/table/divider as canvas blocks", () => {
    expect(isCanvasBlock({ type: "paragraph", text: "x" })).toBe(true);
    expect(isCanvasBlock({ type: "heading", level: 2, text: "x" })).toBe(true);
    expect(isCanvasBlock({ type: "quote", text: "x" })).toBe(true);
    expect(isCanvasBlock({ type: "list", style: "bullet", items: ["x"] })).toBe(true);
    expect(isCanvasBlock({ type: "image", url: "https://x", alt: "x" })).toBe(true);
    expect(isCanvasBlock({ type: "table", rows: [] })).toBe(true);
    expect(isCanvasBlock({ type: "divider" })).toBe(true);
  });

  it("classifies fact-table/faq/pakistan-impact as structured, not canvas, blocks", () => {
    expect(isCanvasBlock({ type: "fact-table", rows: [] })).toBe(false);
    expect(isCanvasBlock({ type: "faq", items: [] })).toBe(false);
    expect(isCanvasBlock({ type: "pakistan-impact", text: "x" })).toBe(false);
  });
});

describe("splitCanvasBlocks / joinCanvasBlocks — position-preserving anchors", () => {
  const para = (text: string): ContentBlock => ({ type: "paragraph", text });
  const heading = (text: string): ContentBlock => ({ type: "heading", level: 2, text });
  const table = (label: string): ContentBlock => ({ type: "fact-table", rows: [{ label, value: "v" }] });

  it("preserves a structured block's original interleaved position on rejoin", () => {
    const original = [para("a"), heading("b"), table("t0"), para("c"), table("t1"), para("d")];
    const { canvas, structured } = splitCanvasBlocks(original);
    expect(canvas).toEqual([para("a"), heading("b"), para("c"), para("d")]);
    expect(joinCanvasBlocks(canvas, structured)).toEqual(original);
  });

  it("splitCanvasBlocks(joinCanvasBlocks(...)) reproduces the exact same anchors — the round-trip property", () => {
    const original = [table("t0"), para("a"), para("b"), table("t1")];
    const { canvas, structured } = splitCanvasBlocks(original);
    const rejoined = joinCanvasBlocks(canvas, structured);
    const resplit = splitCanvasBlocks(rejoined);
    expect(resplit.structured).toEqual(structured);
  });

  it("clamps a structured block to the end when canvas blocks it was anchored to are removed", () => {
    const original = [para("a"), para("b"), table("t"), para("c")];
    const { canvas, structured } = splitCanvasBlocks(original);
    // Simulate the canvas shrinking to just one block (both "a" and "b" removed).
    const shrunkCanvas = [para("z")];
    expect(joinCanvasBlocks(shrunkCanvas, structured)).toEqual([para("z"), table("t")]);
  });

  it("anchors by a preceding-canvas-block COUNT, so inserting new canvas blocks before the anchor shifts it along with that count rather than chasing specific content", () => {
    // The anchor is "how many canvas blocks came before this" — a simple,
    // predictable rule, not a content-identity attachment. table("t") was
    // originally preceded by exactly 1 canvas block (para("a")), so it
    // lands right after whichever block is at that same index once the
    // canvas grows — here, "new1" — not still glued to "a" specifically.
    const original = [para("a"), table("t"), para("b")];
    const { canvas, structured } = splitCanvasBlocks(original);
    const grownCanvas = [para("new1"), para("new2"), para("a"), para("b")];
    expect(joinCanvasBlocks(grownCanvas, structured)).toEqual([para("new1"), table("t"), para("new2"), para("a"), para("b")]);
  });

  it("anchors a brand-new structured block (no prior anchor) after all current canvas content", () => {
    const canvas = [para("a"), para("b")];
    const structured: StructuredBlockAnchor[] = [{ block: table("new"), precedingCanvasCount: canvas.length }];
    expect(joinCanvasBlocks(canvas, structured)).toEqual([para("a"), para("b"), table("new")]);
  });
});

describe("sanitizeArticleBlocks", () => {
  it("strips block 0 when it matches the article title exactly or with whitespace/markdown differences", () => {
    const blocks: ContentBlock[] = [
      { type: "paragraph", text: "Pakistan Develops AI System" },
      { type: "paragraph", text: "The Competition Commission of Pakistan announced a new initiative today." },
    ];
    const cleaned = sanitizeArticleBlocks(blocks, "Pakistan Develops AI System");
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toEqual({ type: "paragraph", text: "The Competition Commission of Pakistan announced a new initiative today." });
  });

  it("handles case-insensitivity and leading hashes in duplicate headlines", () => {
    const blocks: ContentBlock[] = [
      { type: "heading", level: 2, text: "## Pakistan Develops AI System" },
      { type: "paragraph", text: "The Competition Commission of Pakistan announced a new initiative today." },
    ];
    const cleaned = sanitizeArticleBlocks(blocks, "Pakistan develops ai system");
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].type).toBe("paragraph");
  });

  it("preserves legitimate introductory paragraphs that do not duplicate the headline", () => {
    const blocks: ContentBlock[] = [
      { type: "paragraph", text: "ISLAMABAD — In a landmark development, the government has launched a new tech program." },
      { type: "paragraph", text: "Officials confirmed that the rollout will begin next month." },
    ];
    const cleaned = sanitizeArticleBlocks(blocks, "Government Launches Major Technology Initiative");
    expect(cleaned).toHaveLength(2);
    expect(cleaned).toEqual(blocks);
  });

  it("never deletes the only block in an article", () => {
    const blocks: ContentBlock[] = [
      { type: "paragraph", text: "Short announcement headline" },
    ];
    const cleaned = sanitizeArticleBlocks(blocks, "Short announcement headline");
    expect(cleaned).toHaveLength(1);
  });

  it("filters out raw feed metadata blocks like **Published:** ... **Category:**", () => {
    const blocks: ContentBlock[] = [
      { type: "paragraph", text: "Main Accused in Murder Case Arrested" },
      { type: "paragraph", text: "**Published:** October 21, 2026**Category:** Pakistan**Location:** Bahawalpur, Punjab, Pakistan" },
      { type: "paragraph", text: "Police announced the arrest on Wednesday morning." },
    ];
    const cleaned = sanitizeArticleBlocks(blocks, "Main Accused in Murder Case Arrested");
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toEqual({ type: "paragraph", text: "Police announced the arrest on Wednesday morning." });
  });

  it("is idempotent — running repeatedly produces the exact same result", () => {
    const blocks: ContentBlock[] = [
      { type: "paragraph", text: "Duplicate Title" },
      { type: "paragraph", text: "**Published:** Oct 21**Category:** Tech**Location:** Islamabad" },
      { type: "paragraph", text: "Actual story text paragraph." },
    ];
    const firstPass = sanitizeArticleBlocks(blocks, "Duplicate Title");
    const secondPass = sanitizeArticleBlocks(firstPass, "Duplicate Title");
    expect(secondPass).toEqual(firstPass);
    expect(secondPass).toHaveLength(1);
  });
});
