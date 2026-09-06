// Validates a block from untrusted AI JSON output against the subset of
// ContentBlock types an AI-synthesis task may legitimately produce —
// deliberately excludes "image" (the AI never invents images; that's the
// image-acquisition pipeline's job, gated by the image-rights invariant)
// and "pakistan-impact" (a human editorial judgment call, not an AI one).
// Shared by lib/ai/verify-and-synthesize.ts and lib/ai/tasks.ts's
// draftArticleFromDiscovery — same contract, same defensive parsing.
//
// This switch has no `default: return false` catch-all left in it
// deliberately — see the exhaustiveness check at the bottom. A silent
// catch-all is exactly how a block type added to ContentBlock could reach
// here unnoticed and quietly be rejected (or worse, quietly accepted with
// no real validation) instead of the compiler forcing a decision.
import type { ParagraphBlock, HeadingBlock, QuoteBlock, ListBlock, FactTableBlock, FaqBlock, ContentBlock } from "../content-blocks";

export type SynthesizableBlock = ParagraphBlock | HeadingBlock | QuoteBlock | ListBlock | FactTableBlock | FaqBlock;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function isSynthesizableBlock(value: unknown): value is SynthesizableBlock {
  if (typeof value !== "object" || value === null || typeof (value as { type?: unknown }).type !== "string") return false;
  const block = value as Record<string, unknown> & { type: ContentBlock["type"] };
  switch (block.type) {
    case "paragraph":
    case "quote":
      return isNonEmptyString(block.text);
    case "heading":
      return isNonEmptyString(block.text) && (block.level === 2 || block.level === 3);
    case "list":
      return (
        (block.style === "bullet" || block.style === "number") &&
        Array.isArray(block.items) &&
        block.items.length > 0 &&
        block.items.every((i) => typeof i === "string")
      );
    case "fact-table":
      return (
        Array.isArray(block.rows) &&
        block.rows.length > 0 &&
        block.rows.every(
          (r): r is { label: string; value: string } =>
            typeof r === "object" && r !== null && isNonEmptyString((r as Record<string, unknown>).label) && isNonEmptyString((r as Record<string, unknown>).value),
        )
      );
    case "faq":
      return (
        Array.isArray(block.items) &&
        block.items.length > 0 &&
        block.items.every(
          (i): i is { question: string; answer: string } =>
            typeof i === "object" && i !== null && isNonEmptyString((i as Record<string, unknown>).question) && isNonEmptyString((i as Record<string, unknown>).answer),
        )
      );
    // Never AI-producible — see the file comment above.
    case "image":
    case "pakistan-impact":
      return false;
    default:
      // Runtime safety net for genuinely unrecognized input — untrusted AI
      // JSON can set "type" to any string, not just a real ContentBlock
      // member, and falling through with no case matched would otherwise
      // return `undefined` instead of `false`. This does NOT reintroduce
      // the silent catch-all the file comment above warns about: if
      // ContentBlock ever gains a new member without a case added here,
      // block.type narrows to that member's literal (not `never`) in this
      // branch, and the line below fails to compile — same forcing
      // function as before, plus real runtime safety.
      block.type satisfies never;
      return false;
  }
}
