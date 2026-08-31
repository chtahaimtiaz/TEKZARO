import { SectionHeader } from "./SectionHeader";
import { ArticleCard } from "./ArticleCard";
import type { ArticleWithRelations } from "@/lib/types";

interface RelatedArticlesProps {
  articles: ArticleWithRelations[];
}

export function RelatedArticles({ articles }: RelatedArticlesProps) {
  if (articles.length === 0) return null;
  return (
    <section className="mt-14">
      <SectionHeader title="Related Articles" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}
