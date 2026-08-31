import type { Metadata } from "next";
import { ArticleCard } from "@/components/content/ArticleCard";
import { Pagination } from "@/components/content/Pagination";
import { searchArticles } from "@/lib/search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  description: "Search TEKZARO's technology coverage — headlines, articles, categories, tags and authors.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const result = q.trim() ? await searchArticles(q, page) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Search</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Search TEKZARO</h1>

      <form action="/search" method="get" className="mt-6">
        <label htmlFor="search-q" className="sr-only">
          Search headlines, articles, tags or authors
        </label>
        <input
          id="search-q"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search headlines, articles, categories, tags or authors"
          className="w-full rounded-lg border border-border-strong bg-paper-raised px-4 py-3.5 text-base focus:border-accent"
        />
      </form>

      {result && (
        <div className="mt-8">
          <p className="text-sm text-ink-muted">
            {result.total} result{result.total === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
          </p>
          {result.articles.length === 0 ? (
            <p className="mt-6 text-ink-muted">No matching articles. Try a different term.</p>
          ) : (
            <div className="mt-6 flex flex-col gap-6">
              {result.articles.map((article) => (
                <ArticleCard key={article.id} article={article} variant="large" />
              ))}
            </div>
          )}
          <Pagination page={page} pageSize={result.pageSize} total={result.total} basePath={`/search?q=${encodeURIComponent(q)}`} />
        </div>
      )}
    </div>
  );
}
