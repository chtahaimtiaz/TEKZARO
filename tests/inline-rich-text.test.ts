import { describe, it, expect } from "vitest";
import { encodeInlineRichText, parseInlineRichText, stripInlineRichText, canonicalizeInlineRichText } from "../lib/editor/inline-rich-text";

describe("parseInlineRichText", () => {
  it("parses plain text with no marks", () => {
    expect(parseInlineRichText("hello world")).toEqual([{ text: "hello world" }]);
  });

  it("parses bold", () => {
    expect(parseInlineRichText("**bold**")).toEqual([{ text: "bold", bold: true }]);
  });

  it("parses italic", () => {
    expect(parseInlineRichText("_italic_")).toEqual([{ text: "italic", italic: true }]);
  });

  it("parses a safe link", () => {
    expect(parseInlineRichText("[TEKZARO](https://www.tekzaro.co)")).toEqual([
      { text: "TEKZARO", href: "https://www.tekzaro.co" },
    ]);
  });

  it("parses bold and italic combined", () => {
    expect(parseInlineRichText("**_both_**")).toEqual([{ text: "both", bold: true, italic: true }]);
  });

  it("parses a bold link", () => {
    expect(parseInlineRichText("[**text**](https://example.com)")).toEqual([
      { text: "text", bold: true, href: "https://example.com" },
    ]);
  });

  it("mixes marked and unmarked runs in one string", () => {
    expect(parseInlineRichText("plain **bold** plain")).toEqual([
      { text: "plain " },
      { text: "bold", bold: true },
      { text: " plain" },
    ]);
  });

  it("round-trips a literal ** in text that was never marked bold — the escaping regression", () => {
    const original = "rated **excellent**";
    const encoded = encodeInlineRichText([{ text: original }]);
    expect(encoded).not.toBe(original); // must be escaped, not passed through raw
    expect(parseInlineRichText(encoded)).toEqual([{ text: original }]);
  });

  it("rejects a javascript: scheme link — decodes to plain text with no href", () => {
    const tokens = parseInlineRichText("[x](javascript:alert(1))");
    expect(tokens.every((t) => t.href === undefined)).toBe(true);
    expect(tokens.map((t) => t.text).join("")).toContain("x");
  });

  it("accepts http(s), mailto, and root-relative links", () => {
    expect(parseInlineRichText("[a](https://x.com)")[0].href).toBe("https://x.com");
    expect(parseInlineRichText("[a](http://x.com)")[0].href).toBe("http://x.com");
    expect(parseInlineRichText("[a](mailto:x@example.com)")[0].href).toBe("mailto:x@example.com");
    expect(parseInlineRichText("[a](/article/some-slug)")[0].href).toBe("/article/some-slug");
  });

  it("never throws on malformed or unbalanced input", () => {
    const inputs = ["**unclosed bold", "_unclosed italic", "[unclosed bracket", "[text](unclosed paren", "***", "___", "[]()", "\\", "**"];
    for (const input of inputs) {
      expect(() => parseInlineRichText(input)).not.toThrow();
    }
  });

  it("treats an unmatched delimiter as literal text rather than throwing content away", () => {
    const tokens = parseInlineRichText("**unclosed bold");
    expect(tokens.map((t) => t.text).join("")).toBe("**unclosed bold");
  });
});

describe("stripInlineRichText", () => {
  it("returns only the plain text, dropping all syntax", () => {
    expect(stripInlineRichText("**bold** and _italic_ and [a link](https://x.com)")).toBe("bold and italic and a link");
  });

  it("returns the input unchanged when it has no marks", () => {
    expect(stripInlineRichText("plain sentence.")).toBe("plain sentence.");
  });
});

describe("encodeInlineRichText", () => {
  it("wraps marks in the fixed nesting order: link outermost, then bold, then italic", () => {
    expect(
      encodeInlineRichText([
        { text: "x", marks: [{ type: "bold" }, { type: "italic" }, { type: "link", attrs: { href: "https://x.com" } }] },
      ]),
    ).toBe("[**_x_**](https://x.com)");
  });

  it("never encodes an unsafe-scheme link href", () => {
    const encoded = encodeInlineRichText([{ text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }]);
    expect(encoded).not.toContain("javascript:");
  });

  it("round-trips through parse -> encode -> parse for a realistic mixed paragraph", () => {
    const raw = "The **State Bank** said Raast processed _412 million_ transactions, per [the report](https://sbp.org.pk/report).";
    const roundTripped = canonicalizeInlineRichText(raw);
    expect(parseInlineRichText(roundTripped)).toEqual(parseInlineRichText(raw));
  });
});
