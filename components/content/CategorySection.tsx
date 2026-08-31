import { SectionHeader } from "./SectionHeader";
import { ArticleCard } from "./ArticleCard";
import { categoryHref } from "@/lib/constants";
import type { ArticleWithRelations } from "@/lib/types";

interface CategorySectionProps {
  title: string;
  slug: string;
  articles: ArticleWithRelations[];
}

export function CategorySection({ title, slug, articles }: CategorySectionProps) {
  if (articles.length === 0) return null;

  return (
    <section>
      <SectionHeader title={title} href={categoryHref(slug)} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}
