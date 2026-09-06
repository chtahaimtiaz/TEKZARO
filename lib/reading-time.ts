import { stripInlineRichText } from "./editor/inline-rich-text";
import type { ContentBlock } from "./content-blocks";

const WORDS_PER_MINUTE = 220;

function textOf(block: ContentBlock): string {
  switch (block.type) {
    // Marks must never inflate/leak into the word count — strip them, same
    // as blockPlainText.
    case "paragraph":
    case "heading":
    case "quote":
      return stripInlineRichText(block.text);
    case "list":
      return block.items.map(stripInlineRichText).join(" ");
    case "pakistan-impact":
      return block.text;
    case "image":
      return block.caption ?? "";
    case "fact-table":
      return block.rows.map((r) => `${r.label} ${r.value}`).join(" ");
    case "faq":
      return block.items.map((i) => `${i.question} ${i.answer}`).join(" ");
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
