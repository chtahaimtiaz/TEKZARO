import Link from "next/link";
import { getBreakingArticles } from "@/lib/articles";

export async function BreakingTicker() {
  const articles = await getBreakingArticles(8);
  if (articles.length === 0) return null;

  const loop = [...articles, ...articles];

  return (
    <div className="overflow-hidden border-b border-black/10 bg-accent text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        <span className="shrink-0 rounded bg-white/20 px-2 py-0.5 text-xs font-black uppercase tracking-wide">
          Breaking
        </span>
        <div className="overflow-hidden">
          <ul className="flex w-max animate-ticker gap-10 whitespace-nowrap">
            {loop.map((article, i) => (
              <li key={`${article.id}-${i}`}>
                <Link href={`/article/${article.slug}`} className="hover:underline">
                  {article.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
