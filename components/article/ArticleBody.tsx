import Image from "next/image";
import type { ContentBlock } from "@/lib/content-blocks";
import { PakistanImpactCallout } from "./PakistanImpactCallout";
import { isOptimizableImageSrc } from "@/lib/image-src";

interface ArticleBodyProps {
  blocks: ContentBlock[];
}

export function ArticleBody({ blocks }: ArticleBodyProps) {
  return (
    <div className="prose-article space-y-5 text-[1.05rem] leading-relaxed text-ink-soft">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "paragraph":
            return <p key={i}>{block.text}</p>;
          case "heading": {
            const Tag = block.level === 2 ? "h2" : "h3";
            return (
              <Tag key={i} className={block.level === 2 ? "pt-2 text-2xl font-bold text-ink" : "pt-1 text-xl font-bold text-ink"}>
                {block.text}
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-accent pl-4 italic text-ink">
                <p>&ldquo;{block.text}&rdquo;</p>
                {block.cite && <cite className="mt-1 block text-sm not-italic text-ink-muted">— {block.cite}</cite>}
              </blockquote>
            );
          case "list": {
            const ListTag = block.style === "number" ? "ol" : "ul";
            return (
              <ListTag key={i} className={block.style === "number" ? "list-decimal space-y-1 pl-6" : "list-disc space-y-1 pl-6"}>
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
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
          case "pakistan-impact":
            return <PakistanImpactCallout key={i} text={block.text} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
