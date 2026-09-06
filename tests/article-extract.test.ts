import { describe, it, expect } from "vitest";
import { extractArticle } from "../lib/ai/article-extract";

/**
 * The behaviour these lock in is what raised usable evidence per page: the
 * previous approach stripped tags from the whole document, so navigation,
 * cookie banners and related-article rails competed with the article for the
 * character budget — and because that budget truncates, boilerplate could
 * push the article out of the window entirely.
 */
const PAGE = `<!doctype html>
<html><head>
  <title>Fallback Title</title>
  <link rel="canonical" href="https://pub.example/2026/09/chip-story">
  <meta property="og:title" content="Chipmaker doubles memory bandwidth">
  <meta property="article:published_time" content="2026-09-05T09:30:00Z">
  <meta name="author" content="Asma Riaz">
  <script>var tracker = {a:1};</script>
  <style>.x{color:red}</style>
</head><body>
  <nav><a href="/">Home</a><a href="/reviews">Reviews</a></nav>
  <header class="site-header"><p>Sign up for our daily newsletter and never miss a story from us</p></header>
  <div class="cookie-consent"><p>We use cookies to improve your experience on this website, please accept</p></div>
  <article>
    <p>The company said the new part reaches 4.8 terabytes per second of memory bandwidth, roughly double the previous generation.</p>
    <h2>How the memory design changed</h2>
    <p>Stacking the memory dies directly above the logic die shortens the distance a signal has to travel, which is what allows the higher clock without a matching rise in power draw.</p>
    <ul>
      <li>4.8 TB/s peak memory bandwidth, according to the manufacturer</li>
      <li>Sampling to partners in the first quarter</li>
      <li>No pricing disclosed at announcement</li>
    </ul>
    <blockquote>We expect volume production before the end of the year, the company said.</blockquote>
    <p>Independent benchmarks were not provided, and no third party has yet published measurements of the part under sustained load.</p>
  </article>
  <aside class="related-articles"><p>Related: five other stories you might enjoy reading right now today</p></aside>
  <div class="comments"><p>This comment thread contains reader opinions and is not part of the article</p></div>
  <footer><p>Copyright notice and a long list of footer links for the whole website</p></footer>
</body></html>`;

describe("article extraction", () => {
  const a = extractArticle(PAGE, "https://pub.example/x");

  it("pulls metadata from the page head", () => {
    expect(a.title).toBe("Chipmaker doubles memory bandwidth");
    expect(a.author).toBe("Asma Riaz");
    expect(a.publishedAt).toBe("2026-09-05T09:30:00Z");
    expect(a.canonicalUrl).toBe("https://pub.example/2026/09/chip-story");
  });

  it("keeps the article body", () => {
    expect(a.text).toContain("4.8 terabytes per second");
    expect(a.text).toContain("shortens the distance a signal has to travel");
    expect(a.text).toContain("Independent benchmarks were not provided");
  });

  it("keeps structure that carries meaning — subheadings, lists and quotes", () => {
    expect(a.text).toContain("## How the memory design changed");
    expect(a.text).toContain("- 4.8 TB/s peak memory bandwidth");
    expect(a.text).toContain("> We expect volume production");
  });

  it("drops navigation, cookie banners, related rails, comments and footers", () => {
    for (const junk of ["Reviews", "daily newsletter", "We use cookies", "Related:", "comment thread", "Copyright notice"]) {
      expect(a.text, junk).not.toContain(junk);
    }
  });

  it("strips scripts and styles rather than treating them as prose", () => {
    expect(a.text).not.toContain("tracker");
    expect(a.text).not.toContain("color:red");
  });

  it("decodes entities so figures and punctuation survive intact", () => {
    const withEntities = `<article><p>Revenue rose 12% to &pound;4.2m &mdash; the company&#39;s best quarter &amp; its first profit since 2024, according to the filing.</p></article>`;
    const e = extractArticle(withEntities, "https://pub.example/y");
    expect(e.text).toContain("company's best quarter & its first profit");
    expect(e.text).toContain("—");
  });

  it("falls back to flat text when a page has no recognisable structure", () => {
    // Some publishers ship an article as one unstructured blob. Returning
    // nothing there would silently discard usable evidence.
    const flat = `<html><body><div id="content">${"Plain prose with no paragraph tags at all. ".repeat(20)}</div></body></html>`;
    const f = extractArticle(flat, "https://pub.example/z");
    expect(f.length).toBeGreaterThan(400);
    expect(f.text).toContain("Plain prose with no paragraph tags");
  });

  it("does not drop a paragraph merely for discussing advertising", () => {
    // Boilerplate matching is on class/id attributes only — never on body
    // text — so a story about the ad industry survives.
    const adStory = `<article><p>The advertising business generated most of the company's revenue last year, and executives said the cookie deprecation timeline had slipped again.</p></article>`;
    const s = extractArticle(adStory, "https://pub.example/ads");
    expect(s.text).toContain("advertising business generated most");
  });

  it("returns a length consistent with the text it produced", () => {
    expect(a.length).toBe(a.text.length);
    expect(a.length).toBeGreaterThan(300);
  });
});
