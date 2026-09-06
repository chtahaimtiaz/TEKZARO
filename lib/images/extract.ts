import { attrValue, scanTags, extractJsonLdBlocks, forEachJsonLdNode } from "./html-utils";

/** "feed" is the publisher's own RSS/Atom enclosure or media:content
 * image, captured at ingestion on SourceItem.imageUrl. It never comes from
 * scraping the article page, which is what makes it usable when that page
 * is unreachable — the common case, since most publishers either 403 an
 * automated fetch or disallow it in robots.txt.
 *
 * "figure" is an <img> found inside a <figure> element — ranked above a
 * bare "img-tag" because an editor/CMS wrapping an image in <figure> is a
 * deliberate "this illustrates the article" signal, not an incidental icon
 * or UI element that happens to be an <img> somewhere on the page. */
export type ImageMetadataSource = "feed" | "og" | "jsonld" | "twitter" | "figure" | "img-tag";

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

/** True for a `src` that is never a real photo: a base64 data URI (used as
 * a lazy-load placeholder) or a filename fragment that screams "blank
 * spacer", never a legitimate rejection of a real remote image URL. */
function looksLikePlaceholder(src: string): boolean {
  return /^data:/i.test(src) || /\b(blank|placeholder|spacer|1x1|lazy)\b/i.test(src);
}

/** Picks the highest-resolution URL out of a `srcset` attribute — a
 * comma-separated list of "url descriptor" pairs, where the descriptor is
 * either a width ("640w") or a pixel density ("2x"). Splitting on ", "
 * (comma followed by whitespace) is the same simplification the WHATWG
 * spec's own authoring guidance assumes: a URL containing a literal comma
 * must be percent-encoded, so this cannot misparse a well-formed attribute,
 * only a hand-broken one — which then just yields no candidate, not a
 * crash. */
function parseSrcset(raw: string, articleUrl: string): { url: string; width?: number } | null {
  let best: { url: string; width?: number; weight: number } | null = null;
  for (const part of raw.split(/,\s+/)) {
    const [rawUrl, descriptor] = part.trim().split(/\s+/, 2);
    const url = resolveUrl(rawUrl, articleUrl);
    if (!url) continue;
    let width: number | undefined;
    let weight = 1;
    if (descriptor?.endsWith("w")) {
      width = toPositiveInt(descriptor.slice(0, -1));
      weight = width ?? 1;
    } else if (descriptor?.endsWith("x")) {
      weight = Number.parseFloat(descriptor.slice(0, -1)) || 1;
    }
    if (!best || weight > best.weight) best = { url, width, weight };
  }
  return best ? { url: best.url, width: best.width } : null;
}

/** Resolves the actual image URL for one already-isolated `<img ...>` tag,
 * trying (in order): a real `src`, a lazy-load `data-src`/`data-original`
 * when `src` is absent or an obvious placeholder, then `srcset`/
 * `data-srcset` (picking the highest-resolution candidate) as a last
 * resort for markup that never sets a plain `src` at all — a real,
 * increasingly common pattern this previously yielded zero candidates for. */
function resolveImgUrl(tag: string, articleUrl: string): { url: string; width?: number } | null {
  const src = attrValue(tag, "src");
  if (src && !looksLikePlaceholder(src)) {
    const url = resolveUrl(src, articleUrl);
    if (url) return { url };
  }
  const lazySrc = attrValue(tag, "data-src") ?? attrValue(tag, "data-original");
  if (lazySrc) {
    const url = resolveUrl(lazySrc, articleUrl);
    if (url) return { url };
  }
  const srcset = attrValue(tag, "srcset") ?? attrValue(tag, "data-srcset");
  if (srcset) {
    const fromSrcset = parseSrcset(srcset, articleUrl);
    if (fromSrcset) return fromSrcset;
  }
  return null;
}

function extractImgTagCandidates(html: string, articleUrl: string, sourceDomain: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  for (const tag of scanTags(html, "img")) {
    const resolved = resolveImgUrl(tag, articleUrl);
    if (!resolved) continue;
    candidates.push({
      sourceUrl: resolved.url,
      sourceArticleUrl: articleUrl,
      sourceDomain,
      width: toPositiveInt(attrValue(tag, "width")) ?? resolved.width,
      height: toPositiveInt(attrValue(tag, "height")),
      altText: attrValue(tag, "alt") ?? undefined,
      metadataSource: "img-tag",
    });
  }
  return candidates;
}

const MAX_FIGURE_SCAN = 500;

/** <img> elements found inside a <figure>, with the figure's own
 * <figcaption> text preferred as alt/caption text over the img's own alt
 * attribute — a figcaption is an editorial caption, a stronger relevance
 * signal than a generic (or absent) alt string. Matched with a bounded,
 * non-greedy regex over the whole document rather than scanTags (which only
 * finds opening tags) since this needs each figure's full content. */
function extractFigureCandidates(html: string, articleUrl: string, sourceDomain: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  const figureRe = /<figure\b[^>]*>([\s\S]*?)<\/figure>/gi;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = figureRe.exec(html)) && i < MAX_FIGURE_SCAN) {
    i++;
    const inner = match[1];
    const imgTag = /<img\b[^>]*>/i.exec(inner)?.[0];
    if (!imgTag) continue;
    const resolved = resolveImgUrl(imgTag, articleUrl);
    if (!resolved) continue;
    const captionMatch = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(inner);
    const caption = captionMatch ? captionMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    candidates.push({
      sourceUrl: resolved.url,
      sourceArticleUrl: articleUrl,
      sourceDomain,
      width: toPositiveInt(attrValue(imgTag, "width")) ?? resolved.width,
      height: toPositiveInt(attrValue(imgTag, "height")),
      altText: (caption || attrValue(imgTag, "alt")) ?? undefined,
      metadataSource: "figure",
    });
  }
  return candidates;
}

/**
 * Extracts every plausible featured-image candidate from an already-fetched
 * article page's HTML, in priority order: og:image, JSON-LD `image`,
 * twitter:image, an <img> found inside a <figure>, then a conservative flat
 * `<img>` tag scan as a last-resort fallback tier. Both <img>-based tiers
 * also resolve `srcset` and lazy-load `data-src`/`data-srcset` attributes,
 * not just a plain `src` — markup that only ever sets one of those
 * previously yielded no candidate for that image at all. Regex-based on
 * purpose (see html-utils.ts) — never throws; a page with none of these
 * simply yields an empty array, which lib/images/acquire.ts treats as "no
 * image acquired," not an error.
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
    ...extractFigureCandidates(html, articleUrl, sourceDomain),
    ...extractImgTagCandidates(html, articleUrl, sourceDomain),
  ];
}
