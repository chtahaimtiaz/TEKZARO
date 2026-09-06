import { describe, it, expect } from "vitest";
import { blockPlainText } from "../lib/content-blocks";
import type { ContentBlock } from "../lib/content-blocks";

describe("blockPlainText", () => {
  it("returns the text field as-is for paragraph, heading, quote and pakistan-impact blocks", () => {
    expect(blockPlainText({ type: "paragraph", text: "a paragraph" })).toBe("a paragraph");
    expect(blockPlainText({ type: "heading", level: 2, text: "a heading" })).toBe("a heading");
    expect(blockPlainText({ type: "quote", text: "a quote" })).toBe("a quote");
    expect(blockPlainText({ type: "pakistan-impact", text: "an impact note" })).toBe("an impact note");
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
