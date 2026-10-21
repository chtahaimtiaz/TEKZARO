import Image from "next/image";
import { type ContentBlock, sanitizeArticleBlocks } from "@/lib/content-blocks";
import { PakistanImpactCallout } from "./PakistanImpactCallout";
import { isOptimizableImageSrc } from "@/lib/image-src";
import { InlineRichText } from "./InlineRichText";

interface ArticleBodyProps {
  blocks: ContentBlock[];
  articleTitle?: string;
}

export function ArticleBody({ blocks: rawBlocks, articleTitle }: ArticleBodyProps) {
  const blocks = sanitizeArticleBlocks(rawBlocks, articleTitle);
  return (
    <div className="prose-article space-y-5 text-[1.05rem] leading-relaxed text-ink-soft">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "paragraph": {
            const alignClass =
              block.align === "center"
                ? "text-center"
                : block.align === "right"
                ? "text-right"
                : block.align === "justify"
                ? "text-justify"
                : "";
            return (
              <p key={i} className={alignClass || undefined}>
                <InlineRichText text={block.text} />
              </p>
            );
          }
          case "heading": {
            const Tag = block.level === 4 ? "h4" : block.level === 3 ? "h3" : "h2";
            const alignClass =
              block.align === "center"
                ? "text-center"
                : block.align === "right"
                ? "text-right"
                : "";
            const sizeClass =
              block.level === 2
                ? "pt-4 text-2xl font-bold text-ink"
                : block.level === 3
                ? "pt-3 text-xl font-bold text-ink"
                : "pt-2 text-lg font-bold text-ink";
            return (
              <Tag key={i} className={`${sizeClass} ${alignClass}`.trim()}>
                <InlineRichText text={block.text} />
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-accent pl-4 italic text-ink">
                <p>
                  &ldquo;<InlineRichText text={block.text} />&rdquo;
                </p>
                {block.cite && <cite className="mt-1 block text-sm not-italic text-ink-muted">— {block.cite}</cite>}
              </blockquote>
            );
          case "list": {
            const ListTag = block.style === "number" ? "ol" : "ul";
            return (
              <ListTag key={i} className={block.style === "number" ? "list-decimal space-y-1 pl-6" : "list-disc space-y-1 pl-6"}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <InlineRichText text={item} />
                  </li>
                ))}
              </ListTag>
            );
          }
          case "image":
            return (
              <figure key={i} className="my-6">
                <Image src={block.url} alt={block.alt} width={900} height={560} unoptimized={!isOptimizableImageSrc(block.url)} className="w-full rounded-lg object-cover" />
                {(block.caption || block.credit) && (
                  <figcaption className="mt-2 text-sm text-ink-muted">
                    {block.caption} {block.credit && <span className="italic">({block.credit})</span>}
                  </figcaption>
                )}
              </figure>
            );
          case "divider":
            return <hr key={i} className="my-8 border-t border-border" />;
          case "table":
            return (
              <div key={i} className="my-6 overflow-x-auto rounded-xl border border-border bg-paper-raised/30 shadow-xs">
                <table className="w-full min-w-[500px] border-collapse text-left text-sm text-ink-soft">
                  {block.caption && (
                    <caption className="p-3 text-xs font-semibold uppercase tracking-wider text-ink-muted text-left">
                      {block.caption}
                    </caption>
                  )}
                  <tbody>
                    {block.rows.map((row, rIndex) => {
                      const hasHeaderCell = row.cells.some((c) => c.isHeader);
                      return (
                        <tr
                          key={rIndex}
                          className={`border-b border-border/70 last:border-0 ${
                            hasHeaderCell
                              ? "bg-paper-raised font-bold text-ink"
                              : rIndex % 2 === 1
                              ? "bg-paper-raised/20 hover:bg-paper-raised/50"
                              : "hover:bg-paper-raised/40"
                          } transition-colors`}
                        >
                          {row.cells.map((cell, cIndex) => {
                            const CellTag = cell.isHeader ? "th" : "td";
                            const alignClass =
                              cell.align === "center"
                                ? "text-center"
                                : cell.align === "right"
                                ? "text-right"
                                : "text-left";
                            return (
                              <CellTag
                                key={cIndex}
                                colSpan={cell.colspan}
                                rowSpan={cell.rowspan}
                                className={`p-3.5 border-r border-border/50 last:border-r-0 ${alignClass} ${
                                  cell.isHeader ? "font-bold text-ink border-b-2 border-border" : ""
                                }`}
                              >
                                <InlineRichText text={cell.text} />
                              </CellTag>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          case "pakistan-impact":
            return <PakistanImpactCallout key={i} text={block.text} />;
          case "fact-table":
            return (
              <dl key={i} className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border border-border bg-paper-raised p-4 sm:grid-cols-2">
                {block.rows.map((row, j) => (
                  <div key={j} className="flex justify-between gap-3 border-b border-border/60 py-1 last:border-0 sm:border-0 sm:py-0">
                    <dt className="font-semibold text-ink">{row.label}</dt>
                    <dd className="text-right text-ink-soft">{row.value}</dd>
                  </div>
                ))}
              </dl>
            );
          case "faq":
            return (
              <div key={i} className="flex flex-col gap-4">
                {block.items.map((qa, j) => (
                  <div key={j}>
                    <p className="font-bold text-ink">{qa.question}</p>
                    <p className="mt-1">{qa.answer}</p>
                  </div>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}
