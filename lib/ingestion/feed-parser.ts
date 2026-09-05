import { XMLParser } from "fast-xml-parser";

// fast-xml-parser never processes DOCTYPE/ENTITY declarations at all (it's
// not a full XML processor), so it's inherently immune to XXE and
// billion-laughs entity-expansion attacks — that's why it was chosen over a
// libxml-style parser for untrusted feed content.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

export interface ParsedFeedItem {
  title: string;
  link: string;
  canonicalUrl?: string;
  excerpt: string;
  publishedAt: Date | null;
  imageUrl?: string;
  externalId?: string;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["#text"] ?? "");
  }
  return String(value);
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…",
};

/** Decodes named + numeric (decimal and hex) HTML/XML entities — feed titles
 * and descriptions routinely contain both (e.g. "Liux&#8217;s" -> "Liux’s"),
 * and the underlying XML parser doesn't reliably decode every form. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function excerptFrom(raw: string, maxLength = 500): string {
  const plain = stripHtml(raw);
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trim()}…` : plain;
}

function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const d = new Date(textOf(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pulls the publisher's own article image out of a feed item.
 *
 * Only <enclosure type="image/*"> used to be read, which is why the vast
 * majority of items arrived with no image at all: most modern news feeds
 * express their image as Media RSS (<media:content>/<media:thumbnail>)
 * instead. That image is the single most reliable candidate available,
 * because unlike anything scraped from the article page it survives a
 * publisher that 403s automated fetches or disallows them in robots.txt.
 *
 * Order reflects descending specificity: an explicitly image-typed
 * enclosure, then media:content (preferring one that declares an image
 * medium/type), then media:thumbnail, which is often a smaller crop.
 */
function feedImageFrom(item: Record<string, unknown>): string | undefined {
  const enclosure = item.enclosure as { "@_url"?: string; "@_type"?: string } | undefined;
  if (enclosure?.["@_type"]?.startsWith("image") && enclosure["@_url"]) return enclosure["@_url"];

  type MediaNode = { "@_url"?: string; "@_type"?: string; "@_medium"?: string };
  const mediaContent = asArray(item["media:content"] as unknown) as MediaNode[];
  const imageish = mediaContent.filter(
    (m) => m["@_url"] && (m["@_medium"] === "image" || m["@_type"]?.startsWith("image") || (!m["@_medium"] && !m["@_type"])),
  );
  if (imageish.length > 0) return imageish[0]["@_url"];

  const thumb = asArray(item["media:thumbnail"] as unknown) as MediaNode[];
  const firstThumb = thumb.find((t) => t["@_url"]);
  if (firstThumb) return firstThumb["@_url"];

  // Last resort within the feed: the first plausible <img> in the item's
  // own HTML body. Some publishers (9to5Google, MacRumors) ship no Media
  // RSS at all but do embed the lead image here. Ranked below the explicit
  // Media RSS elements because body images are far more likely to be a
  // logo, avatar or tracking pixel — lib/images/filter-rank.ts rejects
  // those by URL, and the download is still magic-byte validated, so a bad
  // guess here degrades to "candidate rejected", never to a bad image.
  const body = textOf(item["content:encoded"] ?? item.description ?? item.content ?? item.summary ?? "");
  if (body) {
    const html = decodeEntities(body);
    const match = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html);
    const src = match?.[1]?.trim();
    if (src && /^https?:\/\//i.test(src)) return src;
  }

  return undefined;
}

function parseRssItem(item: Record<string, unknown>): ParsedFeedItem | null {
  const title = decodeEntities(textOf(item.title).trim());
  const link = textOf(item.link).trim();
  if (!title || !link) return null;

  const guid = item.guid as { "@_isPermaLink"?: string; "#text"?: string } | string | undefined;
  const guidIsPermalink =
    typeof guid === "object" && guid["@_isPermaLink"] !== "false" && Boolean(guid["#text"]);

  return {
    title,
    link,
    canonicalUrl: guidIsPermalink ? textOf((guid as { "#text"?: string })["#text"]) : undefined,
    excerpt: excerptFrom(textOf(item.description ?? item["content:encoded"] ?? "")),
    publishedAt: parseDate(item.pubDate),
    imageUrl: feedImageFrom(item),
    externalId: typeof guid === "string" ? guid : textOf((guid as { "#text"?: string })?.["#text"]) || undefined,
  };
}

function parseAtomEntry(entry: Record<string, unknown>): ParsedFeedItem | null {
  const title = decodeEntities(textOf(entry.title).trim());
  const links = asArray(entry.link as unknown) as { "@_href"?: string; "@_rel"?: string }[];
  const altLink = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
  const link = altLink?.["@_href"]?.trim() ?? "";
  if (!title || !link) return null;

  const id = textOf(entry.id).trim();

  return {
    title,
    link,
    canonicalUrl: id.startsWith("http") ? id : undefined,
    excerpt: excerptFrom(textOf(entry.summary ?? entry.content ?? "")),
    publishedAt: parseDate(entry.published ?? entry.updated),
    // Atom carries no enclosure of its own, but feeds routinely mix in the
    // same Media RSS elements, and an Atom entry previously yielded no
    // image under any circumstances.
    imageUrl: feedImageFrom(entry),
    externalId: id || undefined,
  };
}

/**
 * Parses RSS 2.0 or Atom XML into normalized items. Tolerant by design: a
 * malformed feed or an individual malformed item never throws — it's
 * skipped (or the whole feed yields an empty array) so one bad source can
 * never crash an ingestion run.
 */
export function parseFeed(xml: string): ParsedFeedItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }

  try {
    const rssChannel = (doc.rss as Record<string, unknown> | undefined)?.channel as
      | Record<string, unknown>
      | undefined;
    if (rssChannel) {
      const items = asArray(rssChannel.item as Record<string, unknown> | Record<string, unknown>[]);
      return items
        .map((item) => {
          try {
            return parseRssItem(item);
          } catch {
            return null;
          }
        })
        .filter((i): i is ParsedFeedItem => i !== null);
    }

    const feed = doc.feed as Record<string, unknown> | undefined;
    if (feed) {
      const entries = asArray(feed.entry as Record<string, unknown> | Record<string, unknown>[]);
      return entries
        .map((entry) => {
          try {
            return parseAtomEntry(entry);
          } catch {
            return null;
          }
        })
        .filter((i): i is ParsedFeedItem => i !== null);
    }
  } catch {
    return [];
  }

  return [];
}
