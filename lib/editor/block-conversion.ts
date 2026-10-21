// Bidirectional mapping between the canvas-eligible subset of ContentBlock
// (paragraph/heading/quote/list/image/table/divider — see isCanvasBlock in
// ../content-blocks) and Tiptap's JSONContent doc shape. Only ever called
// with that subset; ArticleEditor.tsx filters via splitCanvasBlocks first.
import type { JSONContent } from "@tiptap/core";
import type { ContentBlock, TableCell, TableRow } from "../content-blocks";
import { encodeInlineRichText, parseInlineRichText, type MarkedTextRun } from "./inline-rich-text";

function textNodesFor(text: string): JSONContent[] {
  const tokens = parseInlineRichText(text);
  return tokens.map((t) => {
    const marks = [
      ...(t.bold ? [{ type: "bold" }] : []),
      ...(t.italic ? [{ type: "italic" }] : []),
      ...(t.underline ? [{ type: "underline" }] : []),
      ...(t.strike ? [{ type: "strike" }] : []),
      ...(t.href ? [{ type: "link", attrs: { href: t.href } }] : []),
    ];
    return marks.length > 0 ? { type: "text", text: t.text, marks } : { type: "text", text: t.text };
  });
}

/** Reads a node's inline text content (a paragraph, a heading, a listItem's
 * inner paragraph) back into the codec's canonical string form. An empty/
 * missing `content` (Tiptap's representation of an empty paragraph) yields
 * "" rather than throwing. */
function textOfNode(node: JSONContent | undefined): string {
  if (!node?.content) return "";
  const runs: MarkedTextRun[] = node.content
    .filter((n): n is JSONContent & { text: string } => n.type === "text" && typeof n.text === "string")
    .map((n) => ({ text: n.text, marks: n.marks as MarkedTextRun["marks"] }));
  return encodeInlineRichText(runs);
}

function blockToNode(block: ContentBlock): JSONContent | null {
  switch (block.type) {
    case "paragraph":
      return {
        type: "paragraph",
        attrs: block.align ? { textAlign: block.align } : undefined,
        content: textNodesFor(block.text),
      };
    case "heading":
      return {
        type: "heading",
        attrs: {
          level: block.level,
          ...(block.align ? { textAlign: block.align } : {}),
        },
        content: textNodesFor(block.text),
      };
    case "quote":
      return {
        type: "blockquote",
        attrs: { cite: block.cite ?? null },
        content: [{ type: "paragraph", content: textNodesFor(block.text) }],
      };
    case "list":
      return {
        type: block.style === "bullet" ? "bulletList" : "orderedList",
        content: block.items.map((item) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: textNodesFor(item) }],
        })),
      };
    case "image":
      return {
        type: "articleImage",
        attrs: { src: block.url, alt: block.alt, caption: block.caption ?? null, credit: block.credit ?? null },
      };
    case "divider":
      return {
        type: "horizontalRule",
      };
    case "table":
      return {
        type: "table",
        content: block.rows.map((row) => ({
          type: "tableRow",
          content: row.cells.map((cell) => {
            const type = cell.isHeader ? "tableHeader" : "tableCell";
            const attrs: Record<string, unknown> = {};
            if (cell.colspan && cell.colspan > 1) attrs.colspan = cell.colspan;
            if (cell.rowspan && cell.rowspan > 1) attrs.rowspan = cell.rowspan;
            const paragraphs = (cell.text || "").split("\n");
            return {
              type,
              attrs,
              content: paragraphs.map((p) => ({
                type: "paragraph",
                attrs: cell.align ? { textAlign: cell.align } : undefined,
                content: textNodesFor(p),
              })),
            };
          }),
        })),
      };
    // Never actually reached — ArticleEditor.tsx always filters to the
    // canvas-eligible subset via splitCanvasBlocks before calling this.
    // Defensive fallback only, so a mistaken caller silently drops the
    // block rather than crashing.
    case "pakistan-impact":
    case "fact-table":
    case "faq":
      return null;
  }
}

export function blocksToTiptapContent(blocks: ContentBlock[]): JSONContent[] {
  return blocks.map(blockToNode).filter((n): n is JSONContent => n !== null);
}

function nodeToBlock(node: JSONContent): ContentBlock | null {
  switch (node.type) {
    case "paragraph": {
      const align = node.attrs?.textAlign as "left" | "center" | "right" | "justify" | undefined;
      return {
        type: "paragraph",
        text: textOfNode(node),
        ...(align && align !== "left" ? { align } : {}),
      };
    }
    case "heading": {
      const level = node.attrs?.level;
      const validLevel = level === 4 ? 4 : level === 3 ? 3 : 2;
      const align = node.attrs?.textAlign as "left" | "center" | "right" | undefined;
      return {
        type: "heading",
        level: validLevel,
        text: textOfNode(node),
        ...(align && align !== "left" ? { align } : {}),
      };
    }
    case "blockquote": {
      const text = textOfNode(node.content?.[0]);
      const cite = typeof node.attrs?.cite === "string" && node.attrs.cite.trim().length > 0 ? node.attrs.cite : undefined;
      return cite ? { type: "quote", text, cite } : { type: "quote", text };
    }
    case "bulletList":
    case "orderedList":
      return {
        type: "list",
        style: node.type === "bulletList" ? "bullet" : "number",
        items: (node.content ?? []).map((li) => textOfNode(li.content?.[0])),
      };
    case "articleImage": {
      const attrs = node.attrs ?? {};
      const block: ContentBlock = {
        type: "image",
        url: typeof attrs.src === "string" ? attrs.src : "",
        alt: typeof attrs.alt === "string" ? attrs.alt : "",
      };
      if (typeof attrs.caption === "string" && attrs.caption.length > 0) block.caption = attrs.caption;
      if (typeof attrs.credit === "string" && attrs.credit.length > 0) block.credit = attrs.credit;
      return block;
    }
    case "horizontalRule":
      return { type: "divider" };
    case "table": {
      const rows: TableRow[] = [];
      for (const r of node.content ?? []) {
        if (r.type !== "tableRow") continue;
        const cells: TableCell[] = [];
        for (const c of r.content ?? []) {
          const isHeader = c.type === "tableHeader";
          const colspan = typeof c.attrs?.colspan === "number" && c.attrs.colspan > 1 ? c.attrs.colspan : undefined;
          const rowspan = typeof c.attrs?.rowspan === "number" && c.attrs.rowspan > 1 ? c.attrs.rowspan : undefined;
          let cellAlign: "left" | "center" | "right" | undefined;
          const textParts: string[] = [];
          for (const p of c.content ?? []) {
            if (p.attrs?.textAlign && !cellAlign) {
              const ta = p.attrs.textAlign as string;
              if (ta === "center" || ta === "right") cellAlign = ta as "center" | "right";
            }
            textParts.push(textOfNode(p));
          }
          cells.push({
            text: textParts.join("\n"),
            ...(isHeader ? { isHeader: true } : {}),
            ...(cellAlign ? { align: cellAlign } : {}),
            ...(colspan ? { colspan } : {}),
            ...(rowspan ? { rowspan } : {}),
          });
        }
        rows.push({ cells });
      }
      return { type: "table", rows };
    }
    default:
      // An unrecognized node type is dropped rather than crashing conversion
      return null;
  }
}

export function tiptapContentToBlocks(doc: JSONContent): ContentBlock[] {
  return (doc.content ?? []).map(nodeToBlock).filter((b): b is ContentBlock => b !== null);
}
