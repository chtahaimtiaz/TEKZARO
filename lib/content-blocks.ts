// Typed structure for Article.content (stored as Prisma Json).
// Kept intentionally small — only what the article renderer and AI Newsroom
// draft generator (Phase 3+) both need to agree on.

export interface ParagraphBlock {
  type: "paragraph";
  text: string;
}

export interface HeadingBlock {
  type: "heading";
  level: 2 | 3;
  text: string;
}

export interface QuoteBlock {
  type: "quote";
  text: string;
  cite?: string;
}

export interface ListBlock {
  type: "list";
  style: "bullet" | "number";
  items: string[];
}

export interface ImageBlock {
  type: "image";
  url: string;
  alt: string;
  caption?: string;
  credit?: string;
}

// Renders as the "What This Means for Pakistan" callout (spec: Pakistan Impact
// Override). Only ever included when a real, evidenced Pakistan angle exists —
// never emitted just because an article is otherwise global.
export interface PakistanImpactBlock {
  type: "pakistan-impact";
  text: string;
}

// A "Key Facts" / "What You Need to Know" panel — price, date, spec,
// eligibility, whatever the story actually has structured facts for. Every
// row must trace to the evidence the model was given; see
// lib/ai/claim-extraction.ts, which reads row values the same way it reads
// paragraph prose, so a fabricated price here is caught exactly like one
// buried in a sentence would be.
export interface FactTableBlock {
  type: "fact-table";
  rows: { label: string; value: string }[];
}

// Used only when it provides real reader value — never manufactured to pad
// length. Every answer must be grounded in the evidence the same way prose
// is; see the same claim-extraction note on FactTableBlock above.
export interface FaqBlock {
  type: "faq";
  items: { question: string; answer: string }[];
}

export type ContentBlock =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | ListBlock
  | ImageBlock
  | PakistanImpactBlock
  | FactTableBlock
  | FaqBlock;

/**
 * Plain-text rendering of any block, for anything that needs to reason
 * about an article's words rather than its structure — claim extraction,
 * the quality gate, word/heading counts, an "improve this article" prompt.
 * Kept as the one place this switch is written: four separate copies of it
 * existed before this, each risking silently missing a new block type
 * (exactly the failure mode a fact-table or FAQ full of unchecked numbers
 * would be) the next time one was added here.
 */
export function blockPlainText(block: ContentBlock): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "pakistan-impact":
      return block.text;
    case "list":
      return block.items.join(". ");
    case "fact-table":
      return block.rows.map((r) => `${r.label}: ${r.value}`).join(". ");
    case "faq":
      return block.items.map((i) => `${i.question} ${i.answer}`).join(" ");
    case "image":
      return block.alt;
    default:
      // Article.content is a Prisma Json field — isArticleContent only
      // checks that `blocks` is an array, never that each element's `type`
      // is one of the members below, so a legacy or corrupted row could
      // reach here with an unrecognized type. Falling through with no case
      // matched would otherwise return `undefined`, which callers that
      // .join() into a claim-checking or word-count string would silently
      // turn into the literal text "undefined". This branch is unreachable
      // for any value actually typed ContentBlock, so it costs nothing
      // today — the line below fails to compile the moment a real new
      // member is added without a case here, same forcing function as an
      // exhaustive switch, plus a safe runtime fallback for bad data.
      block satisfies never;
      return "";
  }
}

export interface ArticleContent {
  blocks: ContentBlock[];
}

export function isArticleContent(value: unknown): value is ArticleContent {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { blocks?: unknown }).blocks)
  );
}

export function asArticleContent(value: unknown): ArticleContent {
  if (isArticleContent(value)) return value;
  return { blocks: [] };
}

/**
 * The editor shows "Pakistan Impact" as its own labeled field rather than a
 * block the writer manually inserts — split it out of the block list for
 * editing, then reassemble on save. Public rendering (ArticleBody) is
 * unaffected either way since it already just maps over `blocks`.
 */
export function splitPakistanImpact(blocks: ContentBlock[]): {
  blocks: ContentBlock[];
  pakistanImpact: string;
} {
  const impactBlock = blocks.find((b): b is PakistanImpactBlock => b.type === "pakistan-impact");
  return {
    blocks: blocks.filter((b) => b.type !== "pakistan-impact"),
    pakistanImpact: impactBlock?.text ?? "",
  };
}

export function joinPakistanImpact(blocks: ContentBlock[], pakistanImpact: string): ContentBlock[] {
  const trimmed = pakistanImpact.trim();
  const withoutImpact = blocks.filter((b) => b.type !== "pakistan-impact");
  return trimmed ? [...withoutImpact, { type: "pakistan-impact", text: trimmed }] : withoutImpact;
}
