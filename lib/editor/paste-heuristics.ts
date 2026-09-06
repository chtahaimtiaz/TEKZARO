// Segments a raw plain-text clipboard paste into a title (maybe) plus
// ContentBlock[] — the "paste a whole article, get real structure" feature.
// Only used for text/plain clipboard content; a real text/html paste (Word,
// Google Docs, a web page) is left to ProseMirror's own schema-driven HTML
// parsing in RichArticleEditor.tsx, which already handles real <h2>/<ul>/
// <blockquote> tags correctly — this module exists for the case where none
// of that markup survived onto the clipboard.
import type { ContentBlock } from "../content-blocks";

export interface PasteSegmentationResult {
  /** Set when the paste's first line reads as a standalone title (short,
   * unpunctuated, single line) AND at least two more chunks follow it. The
   * caller (RichArticleEditor / ArticleEditor) decides whether to actually
   * apply this to the Title field — this function only detects the shape. */
  extractedTitle: string | null;
  /** How the detected-title chunk renders if the caller does NOT apply it
   * as the title (always a plain paragraph — the promotion rule below never
   * promotes the very first chunk of a paste). Null iff extractedTitle is
   * null. Callers that skip title extraction must prepend this to `blocks`
   * so nothing pasted is ever silently dropped. */
  titleAsBodyBlock: ContentBlock | null;
  /** The remaining body content, classified. Excludes the title chunk when
   * extractedTitle is set; otherwise covers the entire paste. */
  blocks: ContentBlock[];
}

const MARKDOWN_HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const QUOTE_LINE_RE = /^>\s?/;
const QUOTE_CITE_RE = /^[-—]\s*(.+)$/;
const BULLET_LINE_RE = /^[•◦▪‣∙·*-]\s+(.+)$/;
const NUMBERED_LINE_RE = /^\d+[.)]\s+(.+)$/;
const SHORT_LINE_END_PUNCTUATION_RE = /[.!?:;,]\s*$/;

type PassOneClassification =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "quote"; text: string; cite?: string }
  | { kind: "list"; style: "bullet" | "number"; items: string[] }
  | { kind: "paragraph"; text: string };

function splitLines(chunk: string): string[] {
  return chunk.split("\n").map((l) => l.trim());
}

/** The shape a chunk must have to be considered a bare, unmarked heading —
 * used both for the title-extraction check (step 1) and the bare-heading
 * promotion check (step 3). Deliberately conservative: short, no internal
 * newline, and doesn't end like a sentence. */
function looksLikeBareHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.includes("\n")) return false;
  if (trimmed.length < 3 || trimmed.length > 70) return false;
  if (SHORT_LINE_END_PUNCTUATION_RE.test(trimmed)) return false;
  if (trimmed.split(/\s+/).filter(Boolean).length > 12) return false;
  return true;
}

function classifyPassOne(chunk: string): PassOneClassification {
  const mdHeading = chunk.match(MARKDOWN_HEADING_RE);
  if (mdHeading && !chunk.includes("\n")) {
    const hashes = mdHeading[1].length;
    return { kind: "heading", level: hashes <= 2 ? 2 : 3, text: mdHeading[2].trim() };
  }

  const lines = splitLines(chunk);
  if (lines.length > 0 && lines.every((l) => QUOTE_LINE_RE.test(l))) {
    const stripped = lines.map((l) => l.replace(QUOTE_LINE_RE, "").trim());
    if (stripped.length >= 2) {
      const citeMatch = stripped[stripped.length - 1].match(QUOTE_CITE_RE);
      if (citeMatch) {
        return { kind: "quote", text: stripped.slice(0, -1).join(" ").trim(), cite: citeMatch[1].trim() };
      }
    }
    return { kind: "quote", text: stripped.join(" ").trim() };
  }

  const nonEmptyLines = lines.filter(Boolean);
  if (nonEmptyLines.length > 0) {
    const allBullet = nonEmptyLines.every((l) => BULLET_LINE_RE.test(l));
    const allNumbered = nonEmptyLines.every((l) => NUMBERED_LINE_RE.test(l));
    if (allBullet) {
      return { kind: "list", style: "bullet", items: nonEmptyLines.map((l) => l.match(BULLET_LINE_RE)![1].trim()) };
    }
    if (allNumbered) {
      return { kind: "list", style: "number", items: nonEmptyLines.map((l) => l.match(NUMBERED_LINE_RE)![1].trim()) };
    }
  }

  return { kind: "paragraph", text: lines.join(" ").trim() };
}

function toContentBlock(c: PassOneClassification): ContentBlock {
  switch (c.kind) {
    case "heading":
      return { type: "heading", level: c.level, text: c.text };
    case "quote":
      return c.cite ? { type: "quote", text: c.text, cite: c.cite } : { type: "quote", text: c.text };
    case "list":
      return { type: "list", style: c.style, items: c.items };
    case "paragraph":
      return { type: "paragraph", text: c.text };
  }
}

export function segmentPlainTextPaste(raw: string): PasteSegmentationResult {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const chunks = normalized
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    return { extractedTitle: null, titleAsBodyBlock: null, blocks: [] };
  }

  let extractedTitle: string | null = null;
  let titleAsBodyBlock: ContentBlock | null = null;
  let bodyChunks = chunks;

  if (chunks.length >= 3) {
    const first = chunks[0];
    const mdHeading = first.match(MARKDOWN_HEADING_RE);
    const candidate = mdHeading && !first.includes("\n") ? mdHeading[2].trim() : first;
    if (looksLikeBareHeading(candidate)) {
      extractedTitle = candidate;
      titleAsBodyBlock = { type: "paragraph", text: first };
      bodyChunks = chunks.slice(1);
    }
  }

  const passOne = bodyChunks.map(classifyPassOne);

  const promoted: PassOneClassification[] = passOne.map((c, i) => {
    if (c.kind !== "paragraph") return c;
    if (i === 0 || i === passOne.length - 1) return c;
    // Rule E already joins a multi-line chunk's lines with a single space
    // before this point, so a short *joined* result alone can't tell a
    // genuine one-line heading apart from e.g. a failed list (mixed bullet/
    // numbered markers) that happened to collapse into a short string.
    // Checking the ORIGINAL chunk for an internal newline catches that.
    if (bodyChunks[i].includes("\n")) return c;
    if (!looksLikeBareHeading(c.text)) return c;
    const prevIsHeading = passOne[i - 1].kind === "heading";
    const nextIsHeading = passOne[i + 1].kind === "heading";
    if (prevIsHeading || nextIsHeading) return c;
    return { kind: "heading", level: 2, text: c.text };
  });

  return { extractedTitle, titleAsBodyBlock, blocks: promoted.map(toContentBlock) };
}
