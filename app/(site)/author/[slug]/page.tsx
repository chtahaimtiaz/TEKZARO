import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/content/ArticleCard";
import { Pagination } from "@/components/content/Pagination";
import { getAuthorArticles, getAuthorBySlug } from "@/lib/articles";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthorBySlug(slug);
  if (!author) return {};
  return {
    title: author.name,
    description: author.bio || `Articles by ${author.name} on TEKZARO.`,
  };
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const author = await getAuthorBySlug(slug);
  if (!author) notFound();

  const { articles, total, pageSize } = await getAuthorArticles(author.id, page);
  const socials = (author.socialLinks as Record<string, string> | null) ?? {};

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col items-start gap-4 border-b border-border pb-8 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-2xl font-bold text-white">
          {author.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </div>
        <div>
          <h1 className="font-serif text-3xl font-bold">{author.name}</h1>
          {author.position && <p className="text-ink-muted">{author.position}</p>}
          {author.bio && <p className="mt-2 max-w-2xl text-ink-soft">{author.bio}</p>}
          {Object.keys(socials).length > 0 && (
            <div className="mt-2 flex gap-3 text-sm">
              {Object.entries(socials).map(([platform, url]) => (
                <a key={platform} href={url} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                  {platform}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {articles.length === 0 ? (
        <p className="mt-8 text-ink-muted">No published articles yet.</p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} basePath={`/author/${slug}`} />
    </div>
  );
}
