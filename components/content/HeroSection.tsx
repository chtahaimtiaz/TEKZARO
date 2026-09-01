import Link from "next/link";
import Image from "next/image";
import { PlaceholderArt } from "@/components/ui/PlaceholderArt";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { AuthorByline } from "./AuthorByline";
import { categoryHref } from "@/lib/constants";
import { isOptimizableImageSrc } from "@/lib/image-src";
import type { ArticleWithRelations } from "@/lib/types";

interface HeroSectionProps {
  main: ArticleWithRelations;
  secondary: ArticleWithRelations[];
}

export function HeroSection({ main, secondary }: HeroSectionProps) {
  const isPakistan = main.category.slug === "pakistan-tech" || main.pakistanRelevance >= 70;

  return (
    <section className="grid gap-6 py-8 lg:grid-cols-[1.6fr_1fr]">
      {/* bg-black, not the ink token: this is the image-fallback surface
          behind a photo + dark gradient scrim, not page chrome — it must
          stay dark regardless of site theme. */}
      <article className="group relative overflow-hidden rounded-xl border border-border bg-black">
        <Link href={`/article/${main.slug}`} className="block aspect-[4/3] overflow-hidden sm:aspect-[16/10]">
          {main.featuredImageUrl ? (
            <Image
              src={main.featuredImageUrl}
              alt={main.featuredImageAlt ?? main.title}
              width={1200}
              height={750}
              priority
              unoptimized={!isOptimizableImageSrc(main.featuredImageUrl)}
              className="h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <PlaceholderArt seed={main.slug} label={main.category.name} className="h-full w-full transition-transform duration-300 group-hover:scale-105" />
          )}
        </Link>
        {/* pt/text sizes step up gradually (not just one mobile/desktop
            jump) since a long headline wraps to more lines the narrower
            the card gets — this overlay is anchored to the bottom of a
            fixed-aspect-ratio image, so it has no scroll of its own; if
            its content ever needs more height than the image provides, the
            overflow-hidden above silently clips the top of the headline. */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-10 sm:p-6 sm:pt-16">
          <div className="flex items-center gap-2">
            <Link
              href={categoryHref(main.category.slug)}
              className={`eyebrow ${isPakistan ? "!text-pakistan" : "!text-accent"} bg-white/90 rounded px-2 py-0.5`}
            >
              {main.category.name}
            </Link>
            {main.isBreaking && (
              <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:text-paper">
                Breaking
              </span>
            )}
            {main.isDemo && <DemoBadge />}
          </div>
          <h1 className="mt-2 text-balance font-serif text-xl font-bold leading-tight text-white sm:mt-3 sm:text-3xl lg:text-4xl">
            <Link href={`/article/${main.slug}`}>{main.title}</Link>
          </h1>
          {main.excerpt && (
            <p className="mt-1 line-clamp-2 hidden max-w-xl text-sm text-white/85 sm:mt-2 sm:block">{main.excerpt}</p>
          )}
          <div className="mt-2 text-xs text-white/80 sm:mt-3 sm:text-sm">
            <AuthorByline author={main.author} publishedAt={main.publishedAt} readingTime={main.readingTime} size="sm" />
          </div>
        </div>
      </article>

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-paper-raised">
        {secondary.map((article) => {
          const pk = article.category.slug === "pakistan-tech" || article.pakistanRelevance >= 70;
          return (
            <article key={article.id} className="flex gap-3 p-4">
              <Link href={`/article/${article.slug}`} className="shrink-0 overflow-hidden rounded-md" style={{ width: 96, height: 68 }}>
                {article.featuredImageUrl ? (
                  <Image src={article.featuredImageUrl} alt={article.featuredImageAlt ?? article.title} width={96} height={68} unoptimized={!isOptimizableImageSrc(article.featuredImageUrl)} className="h-full w-full object-cover" />
                ) : (
                  <PlaceholderArt seed={article.slug} label={article.category.name} className="h-full w-full" />
                )}
              </Link>
              <div className="min-w-0">
                <p className={`eyebrow ${pk ? "eyebrow-pakistan" : ""}`}>{article.category.name}</p>
                <h3 className="line-clamp-2 text-sm font-bold leading-snug">
                  <Link href={`/article/${article.slug}`} className="hover:text-accent">
                    {article.title}
                  </Link>
                </h3>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
