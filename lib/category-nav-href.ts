import type { Category } from "@prisma/client";

/**
 * DB-driven category URL for the public-nav components (SiteHeader,
 * SiteFooter, MoreMenu, MobileMenu) — deliberately separate from
 * lib/constants.ts's categoryHref(slug), which every other call site
 * (ArticleCard, HeroSection, breadcrumbs, RSS, sitemap) keeps using
 * unchanged. Those still hardcode the "pakistan-tech" -> "/pakistan-tech"
 * special case; migrating them to read Category.customRoute live is real
 * follow-up work, not done here, so a customRoute set on any category
 * *other than* pakistan-tech will only take effect in the header/footer
 * nav until that follow-up lands. No "server-only" tag: this is a pure
 * string function with no DB access, safe to import from the client
 * components (MoreMenu/MobileMenu) as well as the server ones.
 */
export function navCategoryHref(category: Pick<Category, "slug" | "customRoute">): string {
  return category.customRoute ?? `/category/${category.slug}`;
}
