import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { SectionHeader } from "@/components/content/SectionHeader";
import { getAutoThumbnailUrl } from "@/lib/videos";
import { isOptimizableImageSrc } from "@/lib/image-src";

async function getHomepageVideos() {
  return prisma.video.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
    take: 4,
    include: { category: true, author: true },
  });
}

export async function VideoSection() {
  const videos = await getHomepageVideos();
  if (videos.length === 0) return null;

  return (
    <section>
      <SectionHeader title="TEKZARO Videos" href="/videos" eyebrow="Watch" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {videos.map((video) => {
          const thumb = getAutoThumbnailUrl(video.videoUrl, video.thumbnailUrl);
          return (
            <article
              key={video.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-paper-raised transition hover:border-accent"
            >
              {/* Thumbnail + play overlay */}
              <Link
                href={`/video/${video.slug}`}
                className="relative block aspect-video w-full overflow-hidden bg-black"
                aria-label={`Watch: ${video.title}`}
              >
                {thumb ? (
                  <Image
                    src={thumb}
                    alt={video.title}
                    fill
                    unoptimized={!isOptimizableImageSrc(thumb)}
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-paper-sunk text-ink-muted">
                    <svg className="h-8 w-8 opacity-40" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                )}
                {/* Play button */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-lg">
                    <svg className="ml-0.5 h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                {/* Duration badge */}
                {video.duration && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {video.duration}
                  </span>
                )}
              </Link>

              {/* Meta */}
              <div className="flex flex-1 flex-col p-3">
                <p className="eyebrow text-[10px]">{video.category.name}</p>
                <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-ink">
                  <Link href={`/video/${video.slug}`} className="hover:text-accent">
                    {video.title}
                  </Link>
                </h3>
                {video.publishedAt && (
                  <p className="mt-auto pt-2 text-[11px] text-ink-muted">
                    {new Date(video.publishedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
