import { describe, it, expect } from "vitest";
import { segmentPlainTextPaste } from "../lib/editor/paste-heuristics";

// The user's own first worked example (from the feature request) — an
// e-bike scheme story with a bare-heading "What Happened"/"Why It Matters",
// a bullet list, and a quote with no attribution line.
const FIRST_EXAMPLE = `Pakistan Launches New E-Bike Scheme

The government has announced a new incentive program for electric bikes across major cities.

What Happened

The new scheme will subsidize electric bike purchases for delivery riders starting next quarter.

Why It Matters

The program could meaningfully reduce fuel imports and urban air pollution over the next five years.

• Lower transportation costs
• Reduce fuel consumption
• Encourage EV adoption

> The minister said the program marks a turning point for urban mobility.`;

// The user's second, more detailed worked example — an AI policy story with
// four bare headings (one followed directly by a list, not a paragraph).
const SECOND_EXAMPLE = `Pakistan's New AI Policy Takes Shape

The government has unveiled a new national strategy for artificial intelligence adoption across public services.

What the Policy Includes

The policy introduces funding for AI research centres and a regulatory sandbox for new applications.

Why It Matters

Pakistan's technology sector has long called for clearer rules on data use and AI deployment.

Key Changes

• AI education
• Research funding
• Industry partnerships

What Happens Next

The policy now moves to public consultation before a final version is expected later this year.`;

describe("segmentPlainTextPaste — worked examples", () => {
  it("matches the user's first worked example exactly", () => {
    const result = segmentPlainTextPaste(FIRST_EXAMPLE);
    expect(result.extractedTitle).toBe("Pakistan Launches New E-Bike Scheme");
    expect(result.blocks.map((b) => b.type)).toEqual(["paragraph", "heading", "paragraph", "heading", "paragraph", "list", "quote"]);
    expect(result.blocks[1]).toMatchObject({ type: "heading", level: 2, text: "What Happened" });
    expect(result.blocks[3]).toMatchObject({ type: "heading", level: 2, text: "Why It Matters" });
    const list = result.blocks[5];
    if (list.type === "list") {
      expect(list.style).toBe("bullet");
      expect(list.items).toEqual(["Lower transportation costs", "Reduce fuel consumption", "Encourage EV adoption"]);
    } else {
      throw new Error("expected a list block");
    }
    expect(result.blocks[6]).toMatchObject({ type: "quote" });
  });

  it("matches the user's second worked example exactly, including a heading immediately followed by a list", () => {
    const result = segmentPlainTextPaste(SECOND_EXAMPLE);
    expect(result.extractedTitle).toBe("Pakistan's New AI Policy Takes Shape");
    expect(result.blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "list",
      "heading",
      "paragraph",
    ]);
    expect(result.blocks[1]).toMatchObject({ type: "heading", level: 2, text: "What the Policy Includes" });
    expect(result.blocks[3]).toMatchObject({ type: "heading", level: 2, text: "Why It Matters" });
    // "Key Changes" is immediately followed by a list, not a paragraph — it
    // must still promote to a heading (the neighbor guard checks "not
    // heading", not "must be paragraph").
    expect(result.blocks[5]).toMatchObject({ type: "heading", level: 2, text: "Key Changes" });
    expect(result.blocks[7]).toMatchObject({ type: "heading", level: 2, text: "What Happens Next" });
  });
});

describe("segmentPlainTextPaste — title extraction", () => {
  it("does not extract a title from a paste with fewer than 3 chunks", () => {
    const result = segmentPlainTextPaste("Short Title\n\nJust one paragraph follows.");
    expect(result.extractedTitle).toBeNull();
    expect(result.titleAsBodyBlock).toBeNull();
    expect(result.blocks[0]).toMatchObject({ type: "paragraph", text: "Short Title" });
  });

  it("provides titleAsBodyBlock as a plain paragraph for the caller to fall back to", () => {
    const result = segmentPlainTextPaste(SECOND_EXAMPLE);
    expect(result.titleAsBodyBlock).toEqual({ type: "paragraph", text: "Pakistan's New AI Policy Takes Shape" });
  });

  it("strips a markdown heading marker from the extracted title", () => {
    const result = segmentPlainTextPaste("## Big Announcement Today\n\nFirst paragraph.\n\nSecond paragraph here.");
    expect(result.extractedTitle).toBe("Big Announcement Today");
  });
});

describe("segmentPlainTextPaste — classification rules", () => {
  it("recognises markdown headings at every hash level", () => {
    const result = segmentPlainTextPaste("A Title Line\n\n# Level one\n\n## Level two\n\n### Level three\n\nClosing paragraph text.");
    const headings = result.blocks.filter((b) => b.type === "heading");
    expect(headings.map((h) => (h.type === "heading" ? h.level : null))).toEqual([2, 2, 3]);
  });

  it("recognises a numbered list", () => {
    const result = segmentPlainTextPaste("Title Line Here\n\nFirst paragraph of real prose content.\n\n1. First step\n2. Second step\n\nClosing thoughts paragraph.");
    const list = result.blocks.find((b) => b.type === "list");
    expect(list).toMatchObject({ type: "list", style: "number", items: ["First step", "Second step"] });
  });

  it("falls through to a paragraph when list markers are mixed", () => {
    const result = segmentPlainTextPaste("Title Line Here\n\nFirst paragraph of real prose content.\n\n• Bullet one\n2. Numbered two\n\nClosing paragraph.");
    const middle = result.blocks[1];
    expect(middle.type).toBe("paragraph");
  });

  it("never promotes the first or last body chunk to a heading", () => {
    const result = segmentPlainTextPaste("A B C D E F G\n\nShort Line\n\nAnother Short One");
    // Only 3 chunks total -> no title extraction (candidate check aside,
    // this asserts position guards independently of title extraction).
    expect(result.blocks[0].type).not.toBe("heading");
    expect(result.blocks[result.blocks.length - 1].type).not.toBe("heading");
  });

  it("does not double-promote a short line adjacent to an explicit markdown heading", () => {
    const result = segmentPlainTextPaste(
      "Title Line Here\n\nReal paragraph content goes here for context.\n\n## Explicit Heading\n\nShort Line Between\n\nFinal closing paragraph of real prose.",
    );
    const kinds = result.blocks.map((b) => b.type);
    // "Short Line Between" sits right after an explicit heading — it must
    // NOT also become a heading.
    const explicitIdx = kinds.indexOf("heading");
    expect(result.blocks[explicitIdx + 1].type).toBe("paragraph");
  });

  it("does not promote a short line ending in sentence punctuation", () => {
    const result = segmentPlainTextPaste("Title Line Here\n\nFirst real paragraph of content.\n\nIs this real?\n\nClosing paragraph of real content.");
    expect(result.blocks.some((b) => b.type === "heading")).toBe(false);
  });

  it("keeps a quote's trailing attribution line as cite, not part of the text", () => {
    const result = segmentPlainTextPaste("Title Line Here\n\nFirst real paragraph of content.\n\n> A powerful quote here.\n> — The Minister\n\nClosing paragraph.");
    const quote = result.blocks.find((b) => b.type === "quote");
    expect(quote).toMatchObject({ type: "quote", text: "A powerful quote here.", cite: "The Minister" });
  });

  it("returns empty results for empty or whitespace-only input", () => {
    expect(segmentPlainTextPaste("")).toEqual({ extractedTitle: null, titleAsBodyBlock: null, blocks: [] });
    expect(segmentPlainTextPaste("   \n\n   ")).toEqual({ extractedTitle: null, titleAsBodyBlock: null, blocks: [] });
  });
});
