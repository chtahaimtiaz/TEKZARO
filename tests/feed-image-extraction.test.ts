import { describe, it, expect } from "vitest";
import { parseFeed } from "../lib/ingestion/feed-parser";

/**
 * Only <enclosure type="image/*"> used to be read, so most real feeds
 * yielded no image at all and acquisition had nothing to fall back on when
 * the article page was blocked. These lock in each markup style that real
 * publishers in TEKZARO's source list actually use.
 */
function rss(itemBody: string): string {
  return `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel><title>T</title>
    <item><title>Story</title><link>https://pub.example/a</link>${itemBody}</item>
  </channel>
</rss>`;
}

describe("feed image extraction", () => {
  it("reads an image-typed enclosure", () => {
    const [item] = parseFeed(rss(`<enclosure url="https://cdn.example/a.jpg" type="image/jpeg"/>`));
    expect(item.imageUrl).toBe("https://cdn.example/a.jpg");
  });

  it("ignores a non-image enclosure rather than treating it as a picture", () => {
    const [item] = parseFeed(rss(`<enclosure url="https://cdn.example/a.mp3" type="audio/mpeg"/>`));
    expect(item.imageUrl).toBeUndefined();
  });

  it("reads media:content — the style most news feeds actually use", () => {
    const [item] = parseFeed(rss(`<media:content url="https://cdn.example/hero.jpg" medium="image"/>`));
    expect(item.imageUrl).toBe("https://cdn.example/hero.jpg");
  });

  it("skips a media:content video and takes the image", () => {
    const [item] = parseFeed(
      rss(`<media:content url="https://cdn.example/v.mp4" medium="video"/><media:content url="https://cdn.example/i.jpg" medium="image"/>`),
    );
    expect(item.imageUrl).toBe("https://cdn.example/i.jpg");
  });

  it("falls back to media:thumbnail", () => {
    const [item] = parseFeed(rss(`<media:thumbnail url="https://cdn.example/t.jpg"/>`));
    expect(item.imageUrl).toBe("https://cdn.example/t.jpg");
  });

  it("prefers an explicit enclosure over a thumbnail crop", () => {
    const [item] = parseFeed(
      rss(`<media:thumbnail url="https://cdn.example/small.jpg"/><enclosure url="https://cdn.example/full.jpg" type="image/png"/>`),
    );
    expect(item.imageUrl).toBe("https://cdn.example/full.jpg");
  });

  it("extracts the lead image from entity-encoded content:encoded HTML", () => {
    const [item] = parseFeed(
      rss(`<content:encoded>&lt;p&gt;Intro&lt;/p&gt;&lt;img src="https://cdn.example/body.jpg" /&gt;</content:encoded>`),
    );
    expect(item.imageUrl).toBe("https://cdn.example/body.jpg");
  });

  it("ignores a relative or non-http body image rather than emitting a broken URL", () => {
    const [item] = parseFeed(rss(`<description>&lt;img src="/local/pic.jpg"&gt;</description>`));
    expect(item.imageUrl).toBeUndefined();
  });

  it("yields no image when the feed genuinely has none", () => {
    const [item] = parseFeed(rss(`<description>Just words.</description>`));
    expect(item.imageUrl).toBeUndefined();
  });

  it("reads Media RSS out of an Atom entry, which previously never had an image", () => {
    const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <entry><title>A</title><link href="https://pub.example/a"/><id>https://pub.example/a</id>
    <media:content url="https://cdn.example/atom.jpg" medium="image"/>
  </entry>
</feed>`;
    const [item] = parseFeed(atom);
    expect(item.imageUrl).toBe("https://cdn.example/atom.jpg");
  });
});
