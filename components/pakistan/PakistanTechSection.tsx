import { SectionHeader } from "@/components/content/SectionHeader";
import { ArticleCard } from "@/components/content/ArticleCard";
import type { ArticleWithRelations } from "@/lib/types";

interface PakistanTechSectionProps {
  articles: ArticleWithRelations[];
}

export function PakistanTechSection({ articles }: PakistanTechSectionProps) {
  if (articles.length === 0) return null;

  return (
    <section className="rounded-xl border border-pakistan/30 bg-pakistan-soft/40 p-5">
      <SectionHeader title="Pakistan Tech" eyebrow="Pakistan First" href="/pakistan-tech" accent="pakistan" />
      <div className="grid gap-5 sm:grid-cols-3">
        {articles.map((article, i) => (
          <div key={article.id} className={i > 0 ? "hidden sm:block" : ""}>
            <ArticleCard article={article} />
          </div>
        ))}
      </div>
    </section>
  );
}
