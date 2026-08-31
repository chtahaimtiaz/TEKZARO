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

export type ContentBlock =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | ListBlock
  | ImageBlock
  | PakistanImpactBlock;

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
