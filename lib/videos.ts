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
 * Extracts a YouTube Video ID from any standard format:
 * - youtube.com/watch?v=...
 * - youtu.be/...
 * - youtube.com/shorts/...
 * - youtube.com/live/...
 * - youtube.com/embed/...
 */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

/**
 * Extracts a Vimeo video ID from vimeo.com/<id>.
 */
export function extractVimeoId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:vimeo\.com\/)(\d+)/);
  return match ? match[1] : null;
}

/**
 * Returns an automatic thumbnail URL if available (e.g. from YouTube),
 * falling back to the custom thumbnail if specified.
 */
export function getAutoThumbnailUrl(videoUrl: string, customThumbnail?: string | null): string | null {
  if (customThumbnail && customThumbnail.trim().length > 0) return customThumbnail;
  const ytId = extractYouTubeId(videoUrl);
  if (ytId) {
    return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  }
  return null;
}

/**
 * Parses a YouTube URL, Vimeo URL, or standard direct video link into an embeddable format.
 */
export function getEmbedVideoUrl(url: string): { type: "youtube" | "vimeo" | "direct"; embedUrl: string } {
  if (!url) return { type: "direct", embedUrl: "" };

  const ytId = extractYouTubeId(url);
  if (ytId) {
    return {
      type: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytId}`,
    };
  }

  const vimeoId = extractVimeoId(url);
  if (vimeoId) {
    return {
      type: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
    };
  }

  return { type: "direct", embedUrl: url };
}
