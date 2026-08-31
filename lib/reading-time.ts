import type { ContentBlock } from "./content-blocks";

const WORDS_PER_MINUTE = 220;

function textOf(block: ContentBlock): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
      return block.text;
    case "list":
      return block.items.join(" ");
    case "pakistan-impact":
      return block.text;
    case "image":
      return block.caption ?? "";
    default:
      return "";
  }
}

export function estimateReadingTime(blocks: ContentBlock[]): number {
  const words = blocks.reduce((sum, block) => {
    const text = textOf(block);
    return sum + (text ? text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
