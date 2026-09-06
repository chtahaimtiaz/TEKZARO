// A small, hand-rolled Markdown-lite codec for inline formatting inside
// ContentBlock text fields (paragraph/heading/quote .text, list .items[]).
// Grammar: **bold**, _italic_ (underscore — unambiguous against **, no
// lookahead needed), [text](url). Combinations nest in a fixed order
// regardless of how Tiptap's own marks array happens to order them: link
// (outermost) -> bold -> italic (innermost). Escapes: \*, \_, \[, \], \\ —
// required so text that was never marked bold/italic but happens to contain
// a literal "**" (someone typing "rated **excellent**" with no formatting
// applied) round-trips as literal text instead of being reinterpreted as
// formatting the next time the article loads.
//
// Zero imports, deliberately: lib/content-blocks.ts (imported everywhere,
// client and server) depends on stripInlineRichText, and must never
// transitively pull in Tiptap/React just to strip marks for a word count.

export interface MarkedTextRun {
  text: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface InlineToken {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Present only when this run is inside a link AND that link's href
   * passed the scheme allowlist below — an unsafe-scheme link is never
   * represented as a link at all, here at the decoder, which is what makes
   * this safe regardless of which write path produced the raw string. */
  href?: string;
}

/** The one authoritative safety boundary for rendering a link — enforced
 * here, not just in the editing UI, so it applies uniformly to the canvas,
 * the Advanced raw-block editor's plain textarea, restoreVersionAction
 * reading an old version snapshot, and a direct server-action call alike. */
const SAFE_HREF_RE = /^(https?:\/\/|mailto:|\/)/i;

function isSafeHref(url: string): boolean {
  return SAFE_HREF_RE.test(url.trim());
}

function escapeLiteral(text: string): string {
  return text.replace(/[\\*_[\]]/g, (ch) => `\\${ch}`);
}

/** Finds the next unescaped occurrence of `delimiter` at or after `from`,
 * treating a backslash as escaping whatever character follows it (so an
 * escaped delimiter is skipped, never matched). -1 if it never appears. */
function findClosing(str: string, from: number, delimiter: string): number {
  let j = from;
  while (j < str.length) {
    if (str[j] === "\\") {
      j += 2;
      continue;
    }
    if (str.startsWith(delimiter, j)) return j;
    j += 1;
  }
  return -1;
}

/** Reads plain text from `from` up to (not including) the next unescaped
 * special character or end of string, resolving \x escapes as it goes. */
function readLiteralRun(str: string, from: number): { text: string; next: number } {
  let out = "";
  let j = from;
  while (j < str.length) {
    const ch = str[j];
    if (ch === "\\" && j + 1 < str.length) {
      out += str[j + 1];
      j += 2;
      continue;
    }
    if (ch === "*" || ch === "_" || ch === "[") break;
    out += ch;
    j += 1;
  }
  return { text: out, next: j };
}

/**
 * Single-pass linear scanner (not chained regexes — chained regex-based
 * nesting is fragile around escape sequences). An unmatched opening
 * delimiter (no closing "**" before the string ends, a malformed "[text("
 * with no closing paren) degrades to literal text rather than throwing —
 * realistic input here includes a hand-edited raw string from the Advanced
 * block editor's plain textarea, or an old version snapshot.
 */
export function parseInlineRichText(raw: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const push = (text: string, bold: boolean, italic: boolean, href: string | null) => {
    if (text.length === 0) return;
    tokens.push({ text, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}), ...(href ? { href } : {}) });
  };

  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "*" && raw[i + 1] === "*") {
      const close = findClosing(raw, i + 2, "**");
      if (close !== -1) {
        for (const t of parseInlineRichText(raw.slice(i + 2, close))) push(t.text, true, Boolean(t.italic), t.href ?? null);
        i = close + 2;
        continue;
      }
    }
    if (raw[i] === "_") {
      const close = findClosing(raw, i + 1, "_");
      if (close !== -1) {
        for (const t of parseInlineRichText(raw.slice(i + 1, close))) push(t.text, Boolean(t.bold), true, t.href ?? null);
        i = close + 1;
        continue;
      }
    }
    if (raw[i] === "[") {
      const closeBracket = findClosing(raw, i + 1, "]");
      if (closeBracket !== -1 && raw[closeBracket + 1] === "(") {
        const closeParen = raw.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const url = raw.slice(closeBracket + 2, closeParen);
          const safe = isSafeHref(url);
          for (const t of parseInlineRichText(raw.slice(i + 1, closeBracket))) push(t.text, Boolean(t.bold), Boolean(t.italic), safe ? url : null);
          i = closeParen + 1;
          continue;
        }
      }
    }

    const { text, next } = readLiteralRun(raw, i);
    if (next === i) {
      // The character at i is itself a special one but matched none of the
      // constructs above (e.g. a stray "[" with no closing "]") — emit it
      // literally and advance by one so the scan always makes progress.
      push(raw[i], false, false, null);
      i += 1;
      continue;
    }
    push(text, false, false, null);
    i = next;
  }

  return tokens;
}

export function stripInlineRichText(raw: string): string {
  return parseInlineRichText(raw)
    .map((t) => t.text)
    .join("");
}

function encodeRun(run: MarkedTextRun): string {
  const marks = run.marks ?? [];
  const bold = marks.some((m) => m.type === "bold");
  const italic = marks.some((m) => m.type === "italic");
  const link = marks.find((m) => m.type === "link");
  const href = link && typeof link.attrs?.href === "string" ? (link.attrs.href as string) : null;

  let out = escapeLiteral(run.text);
  if (italic) out = `_${out}_`;
  if (bold) out = `**${out}**`;
  if (href && isSafeHref(href)) out = `[${out}](${href})`;
  return out;
}

export function encodeInlineRichText(runs: MarkedTextRun[]): string {
  return runs.map(encodeRun).join("");
}

/**
 * Parses a raw string and immediately re-encodes it — canonical output that
 * cannot smuggle anything outside the grammar this module defines. Used as
 * server-side defense in depth (lib/article-actions.ts) alongside the
 * decoder's own href-scheme check, which is the actual safety boundary;
 * this step exists so persisted content can never depend on every future
 * write path remembering to sanitize on its own.
 */
export function canonicalizeInlineRichText(raw: string): string {
  const runs: MarkedTextRun[] = parseInlineRichText(raw).map((t) => ({
    text: t.text,
    marks: [
      ...(t.bold ? [{ type: "bold" }] : []),
      ...(t.italic ? [{ type: "italic" }] : []),
      ...(t.href ? [{ type: "link", attrs: { href: t.href } }] : []),
    ],
  }));
  return encodeInlineRichText(runs);
}
