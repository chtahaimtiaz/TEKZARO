import { prisma } from "./prisma";
import type { Video, Category, Author } from "@prisma/client";

export type VideoWithRelations = Video & {
  category: Category;
  author: Author;
};

export async function getPublishedVideos(limit = 24): Promise<VideoWithRelations[]> {
  return prisma.video.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { category: true, author: true },
  });
}

export async function getVideoBySlug(slug: string): Promise<VideoWithRelations | null> {
  return prisma.video.findUnique({
    where: { slug },
    include: { category: true, author: true },
  });
}

export async function getRelatedVideos(videoId: string, categoryId: string, limit = 4): Promise<VideoWithRelations[]> {
  return prisma.video.findMany({
    where: {
      status: "PUBLISHED",
      categoryId,
      id: { not: videoId },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { category: true, author: true },
  });
}

/**
 * Parses a YouTube URL, Vimeo URL, or standard direct video link into an embeddable format.
 */
export function getEmbedVideoUrl(url: string): { type: "youtube" | "vimeo" | "direct"; embedUrl: string } {
  if (!url) return { type: "direct", embedUrl: "" };

  // YouTube matchers: youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/embed/<id>
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return {
      type: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
    };
  }

  // Vimeo matchers
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      type: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  return { type: "direct", embedUrl: url };
}
