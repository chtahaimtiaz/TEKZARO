import { Fragment, type ReactNode } from "react";
import { parseInlineRichText } from "@/lib/editor/inline-rich-text";

/**
 * Renders the Markdown-lite codec's output (lib/editor/inline-rich-text.ts)
 * as real React elements — never via dangerouslySetInnerHTML. Safe for any
 * string reaching it regardless of write path: the decoder itself is the
 * href-scheme safety boundary, so an unsafe-scheme link never comes back
 * with an `href` at all and simply renders as plain text.
 */
export function InlineRichText({ text }: { text: string }) {
  const tokens = parseInlineRichText(text);
  return (
    <>
      {tokens.map((t, i) => {
        let node: ReactNode = t.text;
        if (t.italic) node = <em>{node}</em>;
        if (t.bold) node = <strong>{node}</strong>;
        if (t.href) {
          node = (
            <a href={t.href} target="_blank" rel="noopener noreferrer">
              {node}
            </a>
          );
        }
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}
