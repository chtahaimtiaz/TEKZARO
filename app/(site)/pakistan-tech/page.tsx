import type { Metadata } from "next";
import { ArticleCard } from "@/components/content/ArticleCard";
import { SectionHeader } from "@/components/content/SectionHeader";
import { Pagination } from "@/components/content/Pagination";
import { getPakistanTechArticles, getTrendingInPakistan, getCategoryBySlug } from "@/lib/articles";
import { AdSlot } from "@/components/ads/AdSlot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pakistan Tech",
  description:
    "Technology news from Pakistan — startups, policy, telecom, cybersecurity, IT exports and the people building Pakistan's digital economy.",
};

export default async function PakistanTechPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [{ articles, total, pageSize }, trending, pakistanCategory] = await Promise.all([
    getPakistanTechArticles(page),
    getTrendingInPakistan(3),
    getCategoryBySlug("pakistan-tech"),
  ]);

  const [featured, ...rest] = articles;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="eyebrow eyebrow-pakistan">Pakistan First</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Pakistan Tech</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Pakistan First, Regional Second, Global Third — TEKZARO&apos;s coverage of Pakistan&apos;s startups,
        telecom, policy, cybersecurity, IT exports and the people building the country&apos;s digital economy.
      </p>

      {page === 1 && pakistanCategory && (
        <AdSlot placement="CATEGORY_TOP" categoryId={pakistanCategory.id} path="/pakistan-tech" className="mt-6" />
      )}

      {page === 1 && featured && (
        <div className="mt-8">
          <ArticleCard article={featured} variant="large" />
        </div>
      )}

      {page === 1 && trending.length > 0 && (
        <section className="mt-10">
          <SectionHeader title="Trending in Pakistan" accent="pakistan" />
          <div className="grid gap-5 sm:grid-cols-3">
            {trending.map((article, i) => (
              <div key={article.id} className={i > 0 ? "hidden sm:block" : ""}>
                <ArticleCard article={article} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <SectionHeader title={page === 1 ? "Latest" : `Pakistan Tech — Page ${page}`} accent="pakistan" />
        {(page === 1 ? rest : articles).length === 0 ? (
          <p className="text-ink-muted">No published Pakistan Tech articles yet.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(page === 1 ? rest : articles).map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </section>

      <Pagination page={page} pageSize={pageSize} total={total} basePath="/pakistan-tech" />
    </div>
  );
}
