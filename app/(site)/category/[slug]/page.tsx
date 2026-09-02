import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArticleCard } from "@/components/content/ArticleCard";
import { SectionHeader } from "@/components/content/SectionHeader";
import { Pagination } from "@/components/content/Pagination";
import { getCategoryArticles, getCategoryBySlug, getCategoryTrending } from "@/lib/articles";
import { CATEGORY_MAP } from "@/lib/constants";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const def = CATEGORY_MAP[slug];
  if (!def) return {};
  return {
    title: def.name,
    description: def.description,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;

  if (slug === "pakistan-tech") redirect("/pakistan-tech");

  const def = CATEGORY_MAP[slug];
  if (!def) notFound();

  const page = Math.max(1, Number(pageParam) || 1);
  const [category, { articles, total, pageSize }, trending] = await Promise.all([
    getCategoryBySlug(slug),
    getCategoryArticles(slug, page),
    getCategoryTrending(slug, 3),
  ]);

  if (!category) notFound();

  const [featured, ...rest] = articles;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="eyebrow">Category</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">{def.name}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{category.description || def.description}</p>

      {page === 1 && featured && (
        <div className="mt-8">
          <ArticleCard article={featured} variant="large" />
        </div>
      )}

      {page === 1 && trending.length > 0 && (
        <section className="mt-10">
          <SectionHeader title={`Trending in ${def.name}`} />
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
        <SectionHeader title={page === 1 ? "Latest" : `${def.name} — Page ${page}`} />
        {(page === 1 ? rest : articles).length === 0 ? (
          <p className="text-ink-muted">No published articles in this category yet.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(page === 1 ? rest : articles).map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </section>

      <Pagination page={page} pageSize={pageSize} total={total} basePath={`/category/${slug}`} />
    </div>
  );
}
