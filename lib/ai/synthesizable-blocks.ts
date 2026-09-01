// Validates a block from untrusted AI JSON output against the subset of
// ContentBlock types an AI-synthesis task may legitimately produce —
// deliberately excludes "image" (the AI never invents images; that's the
// image-acquisition pipeline's job, gated by the image-rights invariant)
// and "pakistan-impact" (a human editorial judgment call, not an AI one).
// Shared by lib/ai/verify-and-synthesize.ts and lib/ai/tasks.ts's
// draftArticleFromDiscovery — same contract, same defensive parsing.
import type { ParagraphBlock, HeadingBlock, QuoteBlock, ListBlock } from "../content-blocks";

export type SynthesizableBlock = ParagraphBlock | HeadingBlock | QuoteBlock | ListBlock;

export function isSynthesizableBlock(value: unknown): value is SynthesizableBlock {
  if (typeof value !== "object" || value === null) return false;
  const block = value as Record<string, unknown>;
  switch (block.type) {
    case "paragraph":
    case "quote":
      return typeof block.text === "string" && block.text.trim().length > 0;
    case "heading":
      return typeof block.text === "string" && block.text.trim().length > 0 && (block.level === 2 || block.level === 3);
    case "list":
      return (
        (block.style === "bullet" || block.style === "number") &&
        Array.isArray(block.items) &&
        block.items.length > 0 &&
        block.items.every((i) => typeof i === "string")
      );
    default:
      return false;
  }
}
