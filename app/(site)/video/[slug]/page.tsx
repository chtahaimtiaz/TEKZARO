import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getVideoBySlug, getRelatedVideos, getEmbedVideoUrl, getAutoThumbnailUrl } from "@/lib/videos";
import { prisma } from "@/lib/prisma";
import { siteUrl, SITE_NAME } from "@/lib/constants";
import { isOptimizableImageSrc } from "@/lib/image-src";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);
  if (!video || video.status !== "PUBLISHED") return {};

  const url = `${siteUrl()}/video/${video.slug}`;
  const thumb = getAutoThumbnailUrl(video.videoUrl, video.thumbnailUrl);
  return {
    title: video.title,
    description: video.description ?? `Watch ${video.title} on ${SITE_NAME}`,
    alternates: { canonical: url },
    openGraph: {
      title: video.title,
      description: video.description ?? undefined,
      url,
      type: "video.other",
      images: thumb ? [{ url: thumb }] : undefined,
    },
  };
}

export default async function VideoDetailPage({ params }: Props) {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);

  if (!video || video.status !== "PUBLISHED") notFound();

  const [related, relatedArticles] = await Promise.all([
    getRelatedVideos(video.id, video.categoryId, 4),
    prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        isDemo: false,
        categoryId: video.categoryId,
      },
      orderBy: { publishedAt: "desc" },
      take: 3,
      include: { category: true, author: true },
    }),
  ]);
  const { type, embedUrl } = getEmbedVideoUrl(video.videoUrl);
  const thumb = getAutoThumbnailUrl(video.videoUrl, video.thumbnailUrl);

  const videoJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: video.description ?? video.title,
    thumbnailUrl: thumb ? [thumb] : [`${siteUrl()}/logo.png`],
    uploadDate: video.publishedAt?.toISOString() ?? video.createdAt.toISOString(),
    contentUrl: video.videoUrl,
    embedUrl: type === "youtube" || type === "vimeo" ? embedUrl : undefined,
  };

  return (
    <article className="mx-auto max-w-4xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-ink-muted">
        <Link href="/" className="hover:text-accent">
          Home
        </Link>
        <span aria-hidden> / </span>
        <Link href="/videos" className="hover:text-accent">
          Videos
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-soft">{video.category.name}</span>
      </nav>

      <div className="flex items-center gap-2">
        <p className="eyebrow">{video.category.name}</p>
      </div>

      <h1 className="mt-2 font-serif text-3xl font-bold leading-tight text-ink sm:text-4xl md:text-5xl">
        {video.title}
      </h1>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3 text-xs text-ink-muted">
        <div>
          <span>Presented by </span>
          <Link href={`/author/${video.author.slug}`} className="font-semibold text-ink hover:underline">
            {video.author.name}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {video.publishedAt && <span>{new Date(video.publishedAt).toLocaleDateString()}</span>}
          {video.duration && <span>• {video.duration}</span>}
        </div>
      </div>

      <div className="mt-6 aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg">
        {type === "youtube" || type === "vimeo" ? (
          <iframe
            src={embedUrl}
            title={video.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <video
            src={video.videoUrl}
            controls
            playsInline
            preload="metadata"
            poster={thumb ?? undefined}
            className="h-full w-full object-contain"
          >
            Your browser does not support the video tag.
          </video>
        )}
      </div>

      {video.description && (
        <div className="mt-8 rounded-xl border border-border bg-paper-raised p-6">
          <h2 className="font-serif text-xl font-bold text-ink">About this Video</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
            {video.description}
          </p>
        </div>
      )}

      {related.length > 0 && (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="font-serif text-2xl font-bold text-ink">More from {video.category.name}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {related.map((v) => {
              const rThumb = getAutoThumbnailUrl(v.videoUrl, v.thumbnailUrl);
              return (
                <div key={v.id} className="flex gap-4">
                  <Link
                    href={`/video/${v.slug}`}
                    className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-black"
                  >
                    {rThumb ? (
                      <img src={rThumb} alt={v.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-ink-muted">
                        Video
                      </div>
                    )}
                    {v.duration && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">
                        {v.duration}
                      </span>
                    )}
                  </Link>
                  <div className="flex flex-col justify-center">
                    <h3 className="font-serif text-sm font-bold text-ink hover:text-accent">
                      <Link href={`/video/${v.slug}`}>{v.title}</Link>
                    </h3>
                    <p className="mt-1 text-[11px] text-ink-muted">By {v.author.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {relatedArticles.length > 0 && (
        <section className="mt-10 border-t border-border pt-8">
          <h2 className="font-serif text-xl font-bold text-ink">Related Articles</h2>
          <div className="mt-4 divide-y divide-border">
            {relatedArticles.map((article) => (
              <div key={article.id} className="flex gap-4 py-4">
                {article.featuredImageUrl && (
                  <Link href={`/article/${article.slug}`} className="shrink-0">
                    <Image
                      src={article.featuredImageUrl}
                      alt={article.featuredImageAlt ?? article.title}
                      width={88}
                      height={62}
                      unoptimized={!isOptimizableImageSrc(article.featuredImageUrl)}
                      className="h-[62px] w-[88px] rounded-md object-cover"
                    />
                  </Link>
                )}
                <div className="min-w-0">
                  <p className="eyebrow text-[10px]">{article.category.name}</p>
                  <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-ink">
                    <Link href={`/article/${article.slug}`} className="hover:text-accent">
                      {article.title}
                    </Link>
                  </h3>
                  {article.publishedAt && (
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {new Date(article.publishedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
