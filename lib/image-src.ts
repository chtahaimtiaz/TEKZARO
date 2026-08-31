/**
 * next/image's built-in optimizer throws (crashing the whole page, not just
 * the image) for any remote host not listed in next.config.ts's
 * images.remotePatterns — which is deliberately empty until a real
 * image host/CDN is configured (see that file's comment). Editorial fields
 * like Article.featuredImageUrl are plain, unrestricted text inputs, so an
 * external URL there is realistic, not just a test artifact — found live
 * during Phase 5 verification when a related-article's external image URL
 * took down an unrelated public article page.
 *
 * Every <Image src={possiblyExternalUrl}> in the public site should pass
 * `unoptimized={!isOptimizableImageSrc(src)}` so an external host degrades
 * to an unoptimized (but still rendering) image instead of a 500.
 */
export function isOptimizableImageSrc(src: string | null | undefined): boolean {
  if (!src) return true;
  // Same-origin/local paths (e.g. /uploads/...) are always safe — next/image
  // never needs a remotePattern entry for these.
  return src.startsWith("/");
}
