import { describe, it, expect } from "vitest";
import { isSynthesizableBlock } from "../lib/ai/synthesizable-blocks";

describe("isSynthesizableBlock", () => {
  it("accepts a well-formed fact-table block", () => {
    expect(isSynthesizableBlock({ type: "fact-table", rows: [{ label: "Price", value: "$999" }] })).toBe(true);
  });

  it("rejects a fact-table block with no rows", () => {
    expect(isSynthesizableBlock({ type: "fact-table", rows: [] })).toBe(false);
  });

  it("rejects a fact-table row missing a label or value", () => {
    expect(isSynthesizableBlock({ type: "fact-table", rows: [{ label: "Price", value: "" }] })).toBe(false);
    expect(isSynthesizableBlock({ type: "fact-table", rows: [{ label: "", value: "$999" }] })).toBe(false);
  });

  it("accepts a well-formed faq block", () => {
    expect(isSynthesizableBlock({ type: "faq", items: [{ question: "Q?", answer: "A." }] })).toBe(true);
  });

  it("rejects a faq block with no items", () => {
    expect(isSynthesizableBlock({ type: "faq", items: [] })).toBe(false);
  });

  it("rejects a faq item missing a question or answer", () => {
    expect(isSynthesizableBlock({ type: "faq", items: [{ question: "Q?", answer: "" }] })).toBe(false);
    expect(isSynthesizableBlock({ type: "faq", items: [{ question: "", answer: "A." }] })).toBe(false);
  });

  it("never accepts an image block from AI output — image selection is a separate pipeline", () => {
    expect(isSynthesizableBlock({ type: "image", url: "https://x/y.jpg", alt: "a photo" })).toBe(false);
  });

  it("never accepts a pakistan-impact block from AI output — that callout is human-editorial only", () => {
    expect(isSynthesizableBlock({ type: "pakistan-impact", text: "This affects Pakistan." })).toBe(false);
  });

  it("still accepts the pre-existing synthesizable types", () => {
    expect(isSynthesizableBlock({ type: "paragraph", text: "hello" })).toBe(true);
    expect(isSynthesizableBlock({ type: "heading", level: 2, text: "hello" })).toBe(true);
    expect(isSynthesizableBlock({ type: "quote", text: "hello" })).toBe(true);
    expect(isSynthesizableBlock({ type: "list", style: "bullet", items: ["a"] })).toBe(true);
  });

  it("rejects malformed input without throwing", () => {
    expect(isSynthesizableBlock(null)).toBe(false);
    expect(isSynthesizableBlock("a string")).toBe(false);
    expect(isSynthesizableBlock({})).toBe(false);
    expect(isSynthesizableBlock({ type: "unknown-type" })).toBe(false);
  });
});
