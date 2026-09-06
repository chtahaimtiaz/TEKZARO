import { describe, it, expect } from "vitest";
import { blockPlainText, isCanvasBlock, splitCanvasBlocks, joinCanvasBlocks } from "../lib/content-blocks";
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
});

describe("isCanvasBlock", () => {
  it("classifies paragraph/heading/quote/list/image as canvas blocks", () => {
    expect(isCanvasBlock({ type: "paragraph", text: "x" })).toBe(true);
    expect(isCanvasBlock({ type: "heading", level: 2, text: "x" })).toBe(true);
    expect(isCanvasBlock({ type: "quote", text: "x" })).toBe(true);
    expect(isCanvasBlock({ type: "list", style: "bullet", items: ["x"] })).toBe(true);
    expect(isCanvasBlock({ type: "image", url: "https://x", alt: "x" })).toBe(true);
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
