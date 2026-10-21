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

  it("round-trips a paragraph with alignment", () => {
    const blocks: ContentBlock[] = [{ type: "paragraph", text: "Centered text.", align: "center" }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips headings at levels 2, 3, and 4", () => {
    const blocks: ContentBlock[] = [
      { type: "heading", level: 2, text: "A section" },
      { type: "heading", level: 3, text: "A subsection" },
      { type: "heading", level: 4, text: "A minor heading", align: "center" },
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

  it("round-trips a divider", () => {
    const blocks: ContentBlock[] = [{ type: "divider" }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips a table with header, cells, and alignment", () => {
    const blocks: ContentBlock[] = [
      {
        type: "table",
        rows: [
          {
            cells: [
              { text: "Device", isHeader: true },
              { text: "Price", isHeader: true, align: "right" },
            ],
          },
          {
            cells: [
              { text: "iPhone 16 Pro" },
              { text: "$999", align: "right" },
            ],
          },
          {
            cells: [
              { text: "Pixel 9 Pro" },
              { text: "$899", align: "right" },
            ],
          },
        ],
      },
    ];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("round-trips inline formatting including bold, italic, underline, strike, and link", () => {
    const blocks: ContentBlock[] = [
      {
        type: "paragraph",
        text: "This is **bold**, _italic_, ++underline++, ~~strike~~, and a [link](https://x.com).",
      },
    ];
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
    const doc = { type: "doc", content: [{ type: "codeBlock" }, { type: "paragraph", content: [{ type: "text", text: "kept" }] }] };
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
      {
        type: "table",
        rows: [
          { cells: [{ text: "Col 1", isHeader: true }, { text: "Col 2", isHeader: true }] },
          { cells: [{ text: "A" }, { text: "B" }] },
        ],
      },
      { type: "divider" },
      { type: "paragraph", text: "Outro." },
    ];
    const { canvas } = splitCanvasBlocks(blocks);
    expect(canvas).toEqual([
      { type: "paragraph", text: "Intro." },
      { type: "heading", level: 2, text: "More" },
      {
        type: "table",
        rows: [
          { cells: [{ text: "Col 1", isHeader: true }, { text: "Col 2", isHeader: true }] },
          { cells: [{ text: "A" }, { text: "B" }] },
        ],
      },
      { type: "divider" },
      { type: "paragraph", text: "Outro." },
    ]);
    const converted = tiptapContentToBlocks({ type: "doc", content: blocksToTiptapContent(canvas) });
    expect(converted).toEqual(canvas);
  });
});
