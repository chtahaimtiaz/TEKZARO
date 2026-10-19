import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVideoBySlug, getRelatedVideos, getEmbedVideoUrl } from "@/lib/videos";
import { siteUrl, SITE_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);
  if (!video || video.status !== "PUBLISHED") return {};

  const url = `${siteUrl()}/video/${video.slug}`;
  return {
    title: video.title,
    description: video.description ?? `Watch ${video.title} on ${SITE_NAME}`,
    alternates: { canonical: url },
    openGraph: {
      title: video.title,
      description: video.description ?? undefined,
      url,
      type: "video.other",
      images: video.thumbnailUrl ? [{ url: video.thumbnailUrl }] : undefined,
    },
  };
}

export default async function VideoDetailPage({ params }: Props) {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);

  if (!video || video.status !== "PUBLISHED") notFound();

  const related = await getRelatedVideos(video.id, video.categoryId, 4);
  const { type, embedUrl } = getEmbedVideoUrl(video.videoUrl);

  const videoJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: video.description ?? video.title,
    thumbnailUrl: video.thumbnailUrl ? [video.thumbnailUrl] : [`${siteUrl()}/logo.png`],
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
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            src={video.videoUrl}
            controls
            poster={video.thumbnailUrl ?? undefined}
            className="h-full w-full object-cover"
          />
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
            {related.map((v) => (
              <div key={v.id} className="flex gap-4">
                <Link
                  href={`/video/${v.slug}`}
                  className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-black"
                >
                  {v.thumbnailUrl ? (
                    <img src={v.thumbnailUrl} alt={v.title} className="h-full w-full object-cover" />
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
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
