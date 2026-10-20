import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/constants";
import { getAutoThumbnailUrl } from "@/lib/videos";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const videos = await prisma.video.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: {
      slug: true,
      title: true,
      description: true,
      videoUrl: true,
      thumbnailUrl: true,
      duration: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  const base = siteUrl();

  const entries = videos
    .map((v) => {
      const thumb = getAutoThumbnailUrl(v.videoUrl, v.thumbnailUrl);
      const pageUrl = `${base}/video/${v.slug}`;
      const lastmod = (v.updatedAt ?? v.publishedAt ?? new Date()).toISOString();

      const thumbTag = thumb
        ? `\n      <video:thumbnail_loc>${esc(thumb)}</video:thumbnail_loc>`
        : "";
      const descTag = v.description
        ? `\n      <video:description>${esc(v.description.slice(0, 2048))}</video:description>`
        : "";
      const durationTag = v.duration
        ? `\n      <video:duration>${durationToSeconds(v.duration)}</video:duration>`
        : "";

      return `  <url>
    <loc>${esc(pageUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <video:video>
      <video:title>${esc(v.title)}</video:title>${thumbTag}${descTag}
      <video:content_loc>${esc(v.videoUrl)}</video:content_loc>
      <video:player_loc>${esc(pageUrl)}</video:player_loc>${durationTag}
      <video:publication_date>${(v.publishedAt ?? new Date()).toISOString()}</video:publication_date>
    </video:video>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
>
${entries}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/** Escape XML special characters */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert a duration string like "10:45" or "1:02:30" to seconds.
 * Returns empty string if it cannot parse.
 */
function durationToSeconds(duration: string): string {
  const parts = duration.split(":").map(Number);
  if (parts.some(isNaN)) return "";
  if (parts.length === 2) {
    const [m, s] = parts;
    return String(m * 60 + s);
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return String(h * 3600 + m * 60 + s);
  }
  return "";
}
