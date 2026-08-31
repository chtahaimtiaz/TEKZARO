import Link from "next/link";
import { ArticleCard } from "@/components/content/ArticleCard";
import type { ArticleWithRelations } from "@/lib/types";

interface TrendingPakistanModuleProps {
  articles: ArticleWithRelations[];
}

export function TrendingPakistanModule({ articles }: TrendingPakistanModuleProps) {
  if (articles.length === 0) return null;

  return (
    <div className="rounded-xl border border-pakistan/30 bg-paper-raised p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="eyebrow eyebrow-pakistan">Trending in Pakistan</p>
        <Link href="/pakistan-tech" className="text-xs font-semibold text-pakistan hover:underline">
          View all →
        </Link>
      </div>
      <div className="divide-y divide-border">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} variant="compact" />
        ))}
      </div>
    </div>
  );
}
