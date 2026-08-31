/**
 * Small shared helpers for lib/images/extract.ts and lib/images/rights.ts —
 * deliberately regex-based tag/attribute scanning rather than a full HTML
 * parser, matching this project's existing "avoid heavy parsing tooling for
 * untrusted input" pattern (fast-xml-parser was chosen over a full XML
 * processor for the same reason in the ingestion feed parser). Every scan
 * below is capped at MAX_TAG_SCAN iterations as defense-in-depth, even
 * though a `g`-flag regex.exec loop over a fixed tag pattern already can't
 * loop forever on its own (each match always advances lastIndex).
 */

export const MAX_TAG_SCAN = 2000;

/** Reads one HTML attribute's value out of a single already-isolated tag
 * string (e.g. "<meta property=\"og:image\" content=\"...\">"). Safe to run
 * with a simple backtracking regex here specifically because the input is a
 * single tag, not the whole document — bounded to a few hundred bytes at
 * most, so there's no ReDoS surface even for a naively-written pattern. */
export function attrValue(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = re.exec(tag);
  return match ? match[1] : null;
}

/** Finds every well-formed `<TAGNAME ...>` opening tag in `html` and yields
 * the raw tag text, capped at MAX_TAG_SCAN matches. */
export function* scanTags(html: string, tagName: string): Generator<string> {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(html)) && i < MAX_TAG_SCAN) {
    i++;
    yield match[0];
  }
}

/** Parses every `<script type="application/ld+json">...</script>` block
 * into a JSON value. Malformed JSON is skipped, never thrown — a source
 * page's broken structured data must never abort acquisition. */
export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(html)) && i < MAX_TAG_SCAN) {
    i++;
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Skip malformed JSON-LD — not every publisher's structured data validates.
    }
  }
  return blocks;
}

/** Shallow, capped traversal of a parsed JSON-LD value — checks the root,
 * one level into `@graph`, and one level into a root array. Deliberately
 * not a recursive/unbounded walk: attacker-crafted deeply-nested JSON could
 * otherwise cause stack exhaustion during traversal (the same failure class
 * this project's own `npm audit` flagged in an unrelated dependency). */
export function forEachJsonLdNode(root: unknown, visit: (node: Record<string, unknown>) => void): void {
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  if (isPlainObject(root)) {
    visit(root);
    const graph = root["@graph"];
    if (Array.isArray(graph)) {
      for (const node of graph.slice(0, MAX_TAG_SCAN)) {
        if (isPlainObject(node)) visit(node);
      }
    }
  } else if (Array.isArray(root)) {
    for (const node of root.slice(0, MAX_TAG_SCAN)) {
      if (isPlainObject(node)) visit(node);
    }
  }
}
