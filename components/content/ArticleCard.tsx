import Link from "next/link";
import Image from "next/image";
import { PlaceholderArt } from "@/components/ui/PlaceholderArt";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { AuthorByline } from "./AuthorByline";
import { categoryHref } from "@/lib/constants";
import { isOptimizableImageSrc } from "@/lib/image-src";
import type { ArticleWithRelations } from "@/lib/types";

interface ArticleCardProps {
  article: ArticleWithRelations;
  variant?: "standard" | "compact" | "large";
}

export function ArticleCard({ article, variant = "standard" }: ArticleCardProps) {
  const href = `/article/${article.slug}`;
  const isPakistan = article.category.slug === "pakistan-tech" || article.pakistanRelevance >= 70;

  if (variant === "compact") {
    return (
      <article className="flex gap-3 border-b border-border py-3 last:border-b-0">
        <Link href={href} className="shrink-0 overflow-hidden rounded-md" style={{ width: 88, height: 62 }}>
          {article.featuredImageUrl ? (
            <Image src={article.featuredImageUrl} alt={article.featuredImageAlt ?? article.title} width={88} height={62} unoptimized={!isOptimizableImageSrc(article.featuredImageUrl)} className="h-full w-full object-cover" />
          ) : (
            <PlaceholderArt seed={article.slug} label={article.category.name} className="h-full w-full" />
          )}
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`eyebrow ${isPakistan ? "eyebrow-pakistan" : ""}`}>{article.category.name}</p>
            {article.isDemo && <DemoBadge />}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
            <Link href={href} className="hover:text-accent">
              {article.title}
            </Link>
          </h3>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-paper-raised">
      <Link href={href} className="block aspect-[16/10] overflow-hidden">
        {article.featuredImageUrl ? (
          <Image
            src={article.featuredImageUrl}
            alt={article.featuredImageAlt ?? article.title}
            width={800}
            height={500}
            unoptimized={!isOptimizableImageSrc(article.featuredImageUrl)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <PlaceholderArt seed={article.slug} label={article.category.name} className="h-full w-full transition-transform duration-300 group-hover:scale-105" />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <Link href={categoryHref(article.category.slug)} className={`eyebrow ${isPakistan ? "eyebrow-pakistan" : ""}`}>
            {article.category.name}
          </Link>
          {article.isBreaking && (
            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:text-paper">
              Breaking
            </span>
          )}
          {article.isDemo && <DemoBadge />}
        </div>
        <h3 className={`font-bold leading-snug text-ink ${variant === "large" ? "text-xl" : "text-base"}`}>
          <Link href={href} className="hover:text-accent">
            {article.title}
          </Link>
        </h3>
        {variant === "large" && article.excerpt && (
          <p className="line-clamp-2 text-sm text-ink-soft">{article.excerpt}</p>
        )}
        <div className="mt-auto pt-2">
          <AuthorByline author={article.author} publishedAt={article.publishedAt} readingTime={article.readingTime} />
        </div>
      </div>
    </article>
  );
}
