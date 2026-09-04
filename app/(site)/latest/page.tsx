import type { Metadata } from "next";
import { ArticleCard } from "@/components/content/ArticleCard";
import { Pagination } from "@/components/content/Pagination";
import { getLatestArchive } from "@/lib/articles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Latest Technology News",
  description: "The latest verified technology news from TEKZARO, updated continuously.",
  alternates: { canonical: "/latest" },
};

export default async function LatestPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { articles, total, pageSize } = await getLatestArchive(page);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="eyebrow">Latest</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Latest Technology News</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Every verified TEKZARO story, newest first.
      </p>

      {articles.length === 0 ? (
        <p className="mt-10 text-ink-muted">No published articles yet.</p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} basePath="/latest" />
    </div>
  );
}
