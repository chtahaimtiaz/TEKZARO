import { describe, it, expect } from "vitest";
import { blocksToTiptapContent, tiptapContentToBlocks } from "../lib/editor/block-conversion";
import { splitCanvasBlocks } from "../lib/content-blocks";
import type { ContentBlock } from "../lib/content-blocks";

function roundTrip(blocks: ContentBlock[]): ContentBlock[] {
  return tiptapContentToBlocks({ type: "doc", content: blocksToTiptapContent(blocks) });
}

describe("blocksToTiptapContent / tiptapContentToBlocks round trip", () => {
  it("round-trips a paragraph", () => {
    const blocks: ContentBlock[] = [{ type: "paragraph", text: "Hello world." }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips headings at both levels", () => {
    const blocks: ContentBlock[] = [
      { type: "heading", level: 2, text: "A section" },
      { type: "heading", level: 3, text: "A subsection" },
    ];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips a quote with a cite", () => {
    const blocks: ContentBlock[] = [{ type: "quote", text: "It was a good year.", cite: "The Minister" }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips a quote with no cite", () => {
    const blocks: ContentBlock[] = [{ type: "quote", text: "It was a good year." }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips a bullet list", () => {
    const blocks: ContentBlock[] = [{ type: "list", style: "bullet", items: ["One", "Two", "Three"] }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips a numbered list", () => {
    const blocks: ContentBlock[] = [{ type: "list", style: "number", items: ["First", "Second"] }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips an image with caption and credit", () => {
    const blocks: ContentBlock[] = [{ type: "image", url: "https://x/y.jpg", alt: "a photo", caption: "a caption", credit: "Reuters" }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips an image with no caption or credit", () => {
    const blocks: ContentBlock[] = [{ type: "image", url: "https://x/y.jpg", alt: "a photo" }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips inline formatting inside a paragraph", () => {
    const blocks: ContentBlock[] = [{ type: "paragraph", text: "This is **bold** and _italic_ and a [link](https://x.com)." }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("treats an empty paragraph as empty text, not a crash", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    expect(tiptapContentToBlocks(doc)).toEqual([{ type: "paragraph", text: "" }]);
  });

  it("clamps an unexpected heading level defensively", () => {
    const doc = { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "x" }] }] };
    expect(tiptapContentToBlocks(doc)).toEqual([{ type: "heading", level: 2, text: "x" }]);
  });

  it("drops an unrecognized node type instead of throwing", () => {
    const doc = { type: "doc", content: [{ type: "horizontalRule" }, { type: "paragraph", content: [{ type: "text", text: "kept" }] }] };
    expect(tiptapContentToBlocks(doc)).toEqual([{ type: "paragraph", text: "kept" }]);
  });
});

describe("splitCanvasBlocks excludes structured types before conversion", () => {
  it("a fixture with fact-table/faq interleaved only converts the canvas subset", () => {
    const blocks: ContentBlock[] = [
      { type: "paragraph", text: "Intro." },
      { type: "fact-table", rows: [{ label: "Price", value: "$999" }] },
      { type: "heading", level: 2, text: "More" },
      { type: "faq", items: [{ question: "Q?", answer: "A." }] },
      { type: "paragraph", text: "Outro." },
    ];
    const { canvas } = splitCanvasBlocks(blocks);
    expect(canvas).toEqual([
      { type: "paragraph", text: "Intro." },
      { type: "heading", level: 2, text: "More" },
      { type: "paragraph", text: "Outro." },
    ]);
    const converted = tiptapContentToBlocks({ type: "doc", content: blocksToTiptapContent(canvas) });
    expect(converted).toEqual(canvas);
  });
});
