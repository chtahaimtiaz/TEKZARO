// Bidirectional mapping between the canvas-eligible subset of ContentBlock
// (paragraph/heading/quote/list/image — see isCanvasBlock in
// ../content-blocks) and Tiptap's JSONContent doc shape. Only ever called
// with that subset; ArticleEditor.tsx filters via splitCanvasBlocks first.
import type { JSONContent } from "@tiptap/core";
import type { ContentBlock } from "../content-blocks";
import { encodeInlineRichText, parseInlineRichText, type MarkedTextRun } from "./inline-rich-text";

function textNodesFor(text: string): JSONContent[] {
  const tokens = parseInlineRichText(text);
  return tokens.map((t) => {
    const marks = [
      ...(t.bold ? [{ type: "bold" }] : []),
      ...(t.italic ? [{ type: "italic" }] : []),
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
      return { type: "paragraph", content: textNodesFor(block.text) };
    case "heading":
      return { type: "heading", attrs: { level: block.level }, content: textNodesFor(block.text) };
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
    case "paragraph":
      return { type: "paragraph", text: textOfNode(node) };
    case "heading": {
      const level = node.attrs?.level;
      return { type: "heading", level: level === 3 ? 3 : 2, text: textOfNode(node) };
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
    default:
      // An unrecognized node type (a future Tiptap/StarterKit addition, or
      // a malformed doc) is dropped rather than crashing the whole
      // conversion — same defensive-fallback convention as the rest of
      // this file, since this walks live editor state on every keystroke.
      return null;
  }
}

export function tiptapContentToBlocks(doc: JSONContent): ContentBlock[] {
  return (doc.content ?? []).map(nodeToBlock).filter((b): b is ContentBlock => b !== null);
}
