import { describe, it, expect } from "vitest";
import { parseFeed } from "../lib/ingestion/feed-parser";

const RSS_SAMPLE = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <item>
      <title>Company Launches New Product</title>
      <link>https://example.com/article-1</link>
      <guid isPermaLink="true">https://example.com/article-1</guid>
      <description><![CDATA[<p>A short <b>summary</b> of the story.</p>]]></description>
      <pubDate>Mon, 31 Aug 2026 10:00:00 GMT</pubDate>
      <enclosure url="https://example.com/image.jpg" type="image/jpeg" />
    </item>
    <item>
      <title>Second Story</title>
      <link>https://example.com/article-2</link>
      <description>Plain text description.</description>
      <pubDate>Mon, 31 Aug 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <entry>
    <title>Atom Entry Title</title>
    <link rel="alternate" href="https://example.com/atom-1" />
    <id>https://example.com/atom-1</id>
    <summary>An atom summary.</summary>
    <updated>2026-08-31T10:00:00Z</updated>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("parses a well-formed RSS 2.0 feed", () => {
    const items = parseFeed(RSS_SAMPLE);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Company Launches New Product");
    expect(items[0].link).toBe("https://example.com/article-1");
    expect(items[0].canonicalUrl).toBe("https://example.com/article-1");
    expect(items[0].excerpt).toContain("A short summary of the story.");
    expect(items[0].excerpt).not.toContain("<p>");
    expect(items[0].publishedAt).toBeInstanceOf(Date);
    expect(items[0].imageUrl).toBe("https://example.com/image.jpg");
  });

  it("parses a well-formed Atom feed", () => {
    const items = parseFeed(ATOM_SAMPLE);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Atom Entry Title");
    expect(items[0].link).toBe("https://example.com/atom-1");
    expect(items[0].canonicalUrl).toBe("https://example.com/atom-1");
  });

  it("returns an empty array for non-XML garbage rather than throwing", () => {
    expect(() => parseFeed("not xml at all { } <<<")).not.toThrow();
    expect(parseFeed("plain text, no tags")).toEqual([]);
  });

  it("returns an empty array for XML that isn't RSS or Atom", () => {
    expect(parseFeed("<html><body>Not a feed</body></html>")).toEqual([]);
  });

  it("decodes numeric and named HTML entities in titles and excerpts", () => {
    const xml = `<rss><channel><item>
      <title>Liux&#8217;s Big Bet &amp; Chinese Rivals</title>
      <link>https://example.com/entities</link>
      <description>A &ldquo;quoted&rdquo; phrase &mdash; with an em dash.</description>
    </item></channel></rss>`;
    const items = parseFeed(xml);
    expect(items[0].title).toBe("Liux’s Big Bet & Chinese Rivals");
    expect(items[0].excerpt).toBe("A “quoted” phrase — with an em dash.");
  });

  it("skips items missing a title or link instead of throwing", () => {
    const partial = `<rss><channel><item><title>No link here</title></item><item><link>https://example.com/only-link</link></item></channel></rss>`;
    expect(parseFeed(partial)).toEqual([]);
  });

  it("does not expand external entities (XXE) or billion-laughs style bombs", () => {
    // fast-xml-parser never processes DOCTYPE/ENTITY at all, so this should
    // parse (or safely no-op) without ever inlining the entity's content —
    // if it did expand, item title would contain "root:" (the classic
    // /etc/passwd XXE probe payload) or the feed would hang/OOM.
    const xxePayload = `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<rss><channel><item><title>&xxe;</title><link>https://example.com/xxe</link></item></channel></rss>`;

    const start = Date.now();
    const items = parseFeed(xxePayload);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000); // no entity-expansion hang
    const title = items[0]?.title ?? "";
    expect(title).not.toContain("root:");
    expect(title).not.toMatch(/\/bin\/(ba)?sh/);
  });
});
