import { buildArticleJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { categoryHref } from "@/lib/constants";
import type { ArticleWithRelations } from "@/lib/types";

interface ArticleJsonLdProps {
  article: ArticleWithRelations;
}

export function ArticleJsonLd({ article }: ArticleJsonLdProps) {
  const jsonLd = [
    buildArticleJsonLd(article),
    breadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: article.category.name, url: categoryHref(article.category.slug) },
      { name: article.title, url: `/article/${article.slug}` },
    ]),
  ];

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
