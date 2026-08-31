import Link from "next/link";
import { HeroSection } from "@/components/content/HeroSection";
import { SectionHeader } from "@/components/content/SectionHeader";
import { ArticleCard } from "@/components/content/ArticleCard";
import { CategorySection } from "@/components/content/CategorySection";
import { PakistanTechSection } from "@/components/pakistan/PakistanTechSection";
import { TrendingPakistanModule } from "@/components/pakistan/TrendingPakistanModule";
import { NewsletterForm } from "@/components/ui/NewsletterForm";
import { selectHero } from "@/lib/ranking";
import {
  getHeroPool,
  getLatestPreview,
  getTrendingArticles,
  getTrendingInPakistan,
  getPakistanTechArticles,
  getCategoryArticles,
} from "@/lib/articles";

export const dynamic = "force-dynamic";

// Order matches the spec's homepage section list (section 3), with Pakistan
// Tech inserted right after the hero per the Pakistan-first addendum.
const HOMEPAGE_CATEGORIES = [
  ["AI", "ai"],
  ["Smartphones", "smartphones"],
  ["Computing", "computing"],
  ["Cybersecurity", "cybersecurity"],
  ["Gadgets", "gadgets"],
  ["Software", "software"],
  ["Gaming", "gaming"],
  ["Startups", "startups"],
  ["Space & Science", "space"],
] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ newsletter?: string }>;
}) {
  const { newsletter } = await searchParams;

  const [heroPool, pakistanTech, latest, trending, trendingPk, categorySections] = await Promise.all([
    getHeroPool(),
    getPakistanTechArticles(1, 4),
    getLatestPreview(8),
    getTrendingArticles(6),
    getTrendingInPakistan(5),
    Promise.all(HOMEPAGE_CATEGORIES.map(([, slug]) => getCategoryArticles(slug, 1, 4))),
  ]);

  const { main, secondary } = selectHero(heroPool);

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 pb-20">
      {main && <HeroSection main={main} secondary={secondary} />}

      <PakistanTechSection articles={pakistanTech.articles} />

      {latest.length > 0 && (
        <section>
          <SectionHeader title="Latest News" href="/latest" eyebrow="Just In" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {latest.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {trending.length > 0 && (
        <section>
          <SectionHeader title="Trending" eyebrow="Right Now" />
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <ol className="grid gap-4 sm:grid-cols-2">
              {trending.map((article, i) => (
                <li key={article.id} className="flex gap-3">
                  <span className="font-serif text-3xl font-black text-border-strong">{i + 1}</span>
                  <ArticleCard article={article} variant="compact" />
                </li>
              ))}
            </ol>
            <TrendingPakistanModule articles={trendingPk} />
          </div>
        </section>
      )}

      {HOMEPAGE_CATEGORIES.map(([title, slug], i) => (
        <CategorySection key={slug} title={title} slug={slug} articles={categorySections[i].articles} />
      ))}

      <section className="rounded-xl bg-ink px-6 py-12 text-center text-white sm:px-12">
        <p className="eyebrow">Stay Ahead of Technology</p>
        <h2 className="mt-2 font-serif text-3xl font-bold">TEKZARO in your inbox</h2>
        <p className="mx-auto mt-2 max-w-md text-white/70">
          Pakistan technology news first, global technology in context — delivered when it matters.
        </p>
        <div className="mt-6 flex justify-center">
          <NewsletterForm redirectTo="/" status={newsletter} />
        </div>
        <Link href="/newsletter" className="mt-3 inline-block text-xs text-white/60 hover:text-white">
          More about the newsletter →
        </Link>
      </section>
    </div>
  );
}
