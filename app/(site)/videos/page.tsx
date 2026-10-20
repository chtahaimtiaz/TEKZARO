import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getEmbedVideoUrl, getAutoThumbnailUrl } from "@/lib/videos";
import { isOptimizableImageSrc } from "@/lib/image-src";
import { SITE_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Videos",
  description: "Watch technology news, in-depth breakdowns, expert analysis, and interviews from TEKZARO.",
  alternates: { canonical: "/videos" },
};

const PAGE_SIZE = 12;

interface SearchParams {
  category?: string;
  page?: string;
}

export default async function VideosIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { category: categorySlug = "", page: pageParam = "1" } = await searchParams;
  const page = Math.max(1, parseInt(pageParam, 10) || 1);

  // Get all categories that have at least 1 published video
  const categories = await prisma.category.findMany({
    where: { videos: { some: { status: "PUBLISHED" } } },
    orderBy: { name: "asc" },
  });

  const where = {
    status: "PUBLISHED" as const,
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
  };

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { category: true, author: true },
    }),
    prisma.video.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const featured = page === 1 && !categorySlug ? (videos.find((v) => v.featured) ?? videos[0]) : null;
  const list = featured ? videos.filter((v) => v.id !== featured.id) : videos;

  function buildHref(params: Partial<SearchParams>) {
    const p = new URLSearchParams();
    if (params.category ?? categorySlug) p.set("category", params.category ?? categorySlug);
    if (params.page && params.page !== "1") p.set("page", params.page);
    const qs = p.toString();
    return `/videos${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="border-b border-border pb-6">
        <p className="eyebrow">TEKZARO Multimedia</p>
        <h1 className="mt-1 font-serif text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          Videos
        </h1>
        <p className="mt-2 text-lg text-ink-soft">
          Watch original video journalism, technology reports, and interviews from Pakistan and worldwide.
        </p>
      </div>

      {/* Category Filters */}
      {categories.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/videos"
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              !categorySlug
                ? "border-accent bg-accent text-white"
                : "border-border text-ink-soft hover:border-accent hover:text-accent"
            }`}
          >
            All
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={buildHref({ category: cat.slug, page: "1" })}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                categorySlug === cat.slug
                  ? "border-accent bg-accent text-white"
                  : "border-border text-ink-soft hover:border-accent hover:text-accent"
              }`}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}

      {/* Featured Video (first page, no category filter) */}
      {featured && (
        <section className="mt-8">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">Featured Video</p>
          <div className="mt-3 grid gap-6 rounded-2xl border border-border bg-paper-raised p-4 sm:p-6 lg:grid-cols-12 lg:items-center">
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-black lg:col-span-8">
              {(() => {
                const { type, embedUrl } = getEmbedVideoUrl(featured.videoUrl);
                const featuredThumb = getAutoThumbnailUrl(featured.videoUrl, featured.thumbnailUrl);
                if (type === "youtube" || type === "vimeo") {
                  return (
                    <iframe
                      src={embedUrl}
                      title={featured.title}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  );
                }
                return (
                  <video
                    src={featured.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    poster={featuredThumb ?? undefined}
                    className="h-full w-full object-contain"
                  />
                );
              })()}
            </div>
            <div className="flex flex-col justify-center lg:col-span-4">
              <span className="eyebrow">{featured.category.name}</span>
              <h2 className="mt-2 font-serif text-2xl font-bold leading-snug text-ink sm:text-3xl">
                <Link href={`/video/${featured.slug}`} className="hover:text-accent">
                  {featured.title}
                </Link>
              </h2>
              {featured.description && (
                <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-ink-soft">
                  {featured.description}
                </p>
              )}
              <div className="mt-5 flex items-center gap-2 text-xs text-ink-muted">
                <span>By {featured.author.name}</span>
                {featured.duration && <span>• {featured.duration}</span>}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Video Grid */}
      <section className="mt-12">
        <h2 className="font-serif text-2xl font-bold text-ink">
          {categorySlug
            ? `${categories.find((c) => c.slug === categorySlug)?.name ?? categorySlug} Videos`
            : "Recent Videos"}
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((video) => {
            const thumb = getAutoThumbnailUrl(video.videoUrl, video.thumbnailUrl);
            return (
              <article
                key={video.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-paper-raised transition hover:border-accent"
              >
                <Link href={`/video/${video.slug}`} className="group relative aspect-video w-full overflow-hidden bg-black">
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt={video.title}
                      fill
                      unoptimized={!isOptimizableImageSrc(thumb)}
                      className="object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-paper-sunk text-sm text-ink-muted">
                      Watch Video
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-90 transition group-hover:bg-black/40">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg">
                      <svg className="ml-0.5 h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                  {video.duration && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {video.duration}
                    </span>
                  )}
                </Link>

                <div className="flex flex-1 flex-col p-4">
                  <span className="eyebrow text-xs">{video.category.name}</span>
                  <h3 className="mt-1 font-serif text-lg font-bold leading-snug text-ink">
                    <Link href={`/video/${video.slug}`} className="hover:text-accent">
                      {video.title}
                    </Link>
                  </h3>
                  {video.description && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                      {video.description}
                    </p>
                  )}
                  <div className="mt-auto pt-4 text-[11px] text-ink-muted">
                    By {video.author.name}
                    {video.publishedAt && (
                      <span> • {new Date(video.publishedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {videos.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center text-ink-muted">
              No videos published yet
              {categorySlug ? ` in this category` : ""}. Check back soon for new video stories from {SITE_NAME}.
            </div>
          )}
        </div>
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          {page > 1 && (
            <Link
              href={buildHref({ page: String(page - 1) })}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-paper-raised"
            >
              ← Previous
            </Link>
          )}
          <span className="text-sm text-ink-muted">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link
              href={buildHref({ page: String(page + 1) })}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-paper-raised"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
