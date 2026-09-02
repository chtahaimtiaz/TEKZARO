export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: Date;
  guid: string;
  category?: string;
  author?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRssFeed(options: {
  title: string;
  description: string;
  link: string;
  selfLink: string;
  items: RssItem[];
  /** RFC 3066 language code for the <language> element. Defaults to
   * "en-us" — existing English feeds are unaffected by this option. */
  language?: string;
}): string {
  const { title, description, link, selfLink, items, language = "en-us" } = options;

  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      ${item.author ? `<author>${escapeXml(item.author)}</author>` : ""}
      ${item.category ? `<category>${escapeXml(item.category)}</category>` : ""}
      <description>${escapeXml(item.description)}</description>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <language>${escapeXml(language)}</language>
    <atom:link href="${escapeXml(selfLink)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}
