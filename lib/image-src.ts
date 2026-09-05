/**
 * next/image's built-in optimizer throws (crashing the whole page, not just
 * the image) for any remote host not listed in next.config.ts's
 * images.remotePatterns — which is deliberately narrow until a real
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
  if (src.startsWith("/")) return true;

  // Our own object stores are trusted — Vercel Blob
  // (STORAGE_PROVIDER=vercel-blob) and Cloudflare R2's public subdomain
  // (STORAGE_PROVIDER=r2). Matched by hostname via URL parsing, not a
  // substring check, and mirroring next.config.ts's images.remotePatterns
  // entries exactly; the two must stay in step, since a host trusted in one
  // but not the other either crashes the page or silently skips
  // optimization. Any other external host (RSS-sourced images, an
  // editor-pasted URL) stays unoptimized rather than being added here.
  try {
    const { hostname } = new URL(src);
    return hostname.endsWith(".public.blob.vercel-storage.com") || hostname.endsWith(".r2.dev");
  } catch {
    return false;
  }
}
