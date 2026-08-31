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

function parseRssItem(item: Record<string, unknown>): ParsedFeedItem | null {
  const title = decodeEntities(textOf(item.title).trim());
  const link = textOf(item.link).trim();
  if (!title || !link) return null;

  const guid = item.guid as { "@_isPermaLink"?: string; "#text"?: string } | string | undefined;
  const guidIsPermalink =
    typeof guid === "object" && guid["@_isPermaLink"] !== "false" && Boolean(guid["#text"]);

  const enclosure = item.enclosure as { "@_url"?: string; "@_type"?: string } | undefined;

  return {
    title,
    link,
    canonicalUrl: guidIsPermalink ? textOf((guid as { "#text"?: string })["#text"]) : undefined,
    excerpt: excerptFrom(textOf(item.description ?? item["content:encoded"] ?? "")),
    publishedAt: parseDate(item.pubDate),
    imageUrl: enclosure?.["@_type"]?.startsWith("image") ? enclosure["@_url"] : undefined,
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
