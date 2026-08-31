import { attrValue, scanTags, extractJsonLdBlocks, forEachJsonLdNode } from "./html-utils";

export type ImageMetadataSource = "og" | "jsonld" | "twitter" | "img-tag";

export interface ImageCandidate {
  sourceUrl: string;
  sourceArticleUrl: string;
  sourceDomain: string;
  width?: number;
  height?: number;
  altText?: string;
  metadataSource: ImageMetadataSource;
}

function resolveUrl(raw: string | null | undefined, articleUrl: string): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const resolved = new URL(raw.trim(), articleUrl);
    // Only ever hand back http(s) — a data:/blob:/etc. candidate can never
    // be fetched through safeFetchBinary's protocol allowlist anyway, so
    // dropping it here keeps the acquisition audit trail free of noise.
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function toPositiveInt(raw: unknown): number | undefined {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function extractMetaCandidates(
  html: string,
  articleUrl: string,
  sourceDomain: string,
): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  // og:image[:width|:height|:alt] can appear in any order and repeat (a page
  // may declare several) — track the most recently seen og:image and attach
  // trailing width/height/alt meta tags to it, same convention every OG
  // consumer uses.
  let pendingOg: ImageCandidate | null = null;
  let pendingTwitter: ImageCandidate | null = null;

  for (const tag of scanTags(html, "meta")) {
    const key = (attrValue(tag, "property") ?? attrValue(tag, "name"))?.toLowerCase();
    const content = attrValue(tag, "content");
    if (!key || content === null) continue;

    if (key === "og:image" || key === "og:image:url" || key === "og:image:secure_url") {
      const url = resolveUrl(content, articleUrl);
      if (url) {
        pendingOg = { sourceUrl: url, sourceArticleUrl: articleUrl, sourceDomain, metadataSource: "og" };
        candidates.push(pendingOg);
      }
      continue;
    }
    if (key === "og:image:width" && pendingOg) {
      pendingOg.width = toPositiveInt(content);
      continue;
    }
    if (key === "og:image:height" && pendingOg) {
      pendingOg.height = toPositiveInt(content);
      continue;
    }
    if (key === "og:image:alt" && pendingOg) {
      pendingOg.altText = content;
      continue;
    }

    if (key === "twitter:image" || key === "twitter:image:src") {
      const url = resolveUrl(content, articleUrl);
      if (url) {
        pendingTwitter = { sourceUrl: url, sourceArticleUrl: articleUrl, sourceDomain, metadataSource: "twitter" };
        candidates.push(pendingTwitter);
      }
      continue;
    }
    if (key === "twitter:image:alt" && pendingTwitter) {
      pendingTwitter.altText = content;
    }
  }

  return candidates;
}

function imageObjectToCandidate(
  node: unknown,
  articleUrl: string,
  sourceDomain: string,
): ImageCandidate | null {
  if (typeof node === "string") {
    const url = resolveUrl(node, articleUrl);
    return url ? { sourceUrl: url, sourceArticleUrl: articleUrl, sourceDomain, metadataSource: "jsonld" } : null;
  }
  if (typeof node === "object" && node !== null) {
    const obj = node as Record<string, unknown>;
    const rawUrl = typeof obj.url === "string" ? obj.url : typeof obj["@id"] === "string" ? (obj["@id"] as string) : undefined;
    const url = resolveUrl(rawUrl, articleUrl);
    if (!url) return null;
    return {
      sourceUrl: url,
      sourceArticleUrl: articleUrl,
      sourceDomain,
      width: toPositiveInt(obj.width),
      height: toPositiveInt(obj.height),
      metadataSource: "jsonld",
    };
  }
  return null;
}

function extractJsonLdCandidates(html: string, articleUrl: string, sourceDomain: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  for (const block of extractJsonLdBlocks(html)) {
    forEachJsonLdNode(block, (node) => {
      const image = node.image;
      if (Array.isArray(image)) {
        for (const entry of image.slice(0, 20)) {
          const c = imageObjectToCandidate(entry, articleUrl, sourceDomain);
          if (c) candidates.push(c);
        }
      } else if (image) {
        const c = imageObjectToCandidate(image, articleUrl, sourceDomain);
        if (c) candidates.push(c);
      }
    });
  }
  return candidates;
}

function extractImgTagCandidates(html: string, articleUrl: string, sourceDomain: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  for (const tag of scanTags(html, "img")) {
    const src = attrValue(tag, "src");
    const url = resolveUrl(src, articleUrl);
    if (!url) continue;
    candidates.push({
      sourceUrl: url,
      sourceArticleUrl: articleUrl,
      sourceDomain,
      width: toPositiveInt(attrValue(tag, "width")),
      height: toPositiveInt(attrValue(tag, "height")),
      altText: attrValue(tag, "alt") ?? undefined,
      metadataSource: "img-tag",
    });
  }
  return candidates;
}

/**
 * Extracts every plausible featured-image candidate from an already-fetched
 * article page's HTML, in priority order: og:image, JSON-LD `image`,
 * twitter:image, then a conservative flat `<img>` tag scan as a last-resort
 * fallback tier. Regex-based on purpose (see html-utils.ts) — never throws;
 * a page with none of these simply yields an empty array, which
 * lib/images/acquire.ts treats as "no image acquired," not an error.
 */
export function extractImageCandidates(html: string, articleUrl: string): ImageCandidate[] {
  let sourceDomain: string;
  try {
    sourceDomain = new URL(articleUrl).hostname;
  } catch {
    return [];
  }

  return [
    ...extractMetaCandidates(html, articleUrl, sourceDomain),
    ...extractJsonLdCandidates(html, articleUrl, sourceDomain),
    ...extractImgTagCandidates(html, articleUrl, sourceDomain),
  ];
}
