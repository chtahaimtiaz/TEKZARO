import { describe, it, expect } from "vitest";
import { extractImageCandidates } from "../lib/images/extract";

const ARTICLE_URL = "https://news.example.com/story/some-headline";

describe("extractImageCandidates", () => {
  it("extracts og:image plus its trailing width/height/alt companion tags, attributes in any order", () => {
    const html = `
      <html><head>
        <meta content="https://cdn.example.com/hero.jpg" property="og:image">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="675">
        <meta property="og:image:alt" content="A hero photo">
      </head></html>
    `;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    const og = candidates.find((c) => c.metadataSource === "og");
    expect(og).toBeDefined();
    expect(og!.sourceUrl).toBe("https://cdn.example.com/hero.jpg");
    expect(og!.width).toBe(1200);
    expect(og!.height).toBe(675);
    expect(og!.altText).toBe("A hero photo");
    expect(og!.sourceArticleUrl).toBe(ARTICLE_URL);
    expect(og!.sourceDomain).toBe("news.example.com");
  });

  it("resolves a relative og:image URL against the article URL", () => {
    const html = `<meta property="og:image" content="/media/photo.jpg">`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates[0].sourceUrl).toBe("https://news.example.com/media/photo.jpg");
  });

  it("extracts twitter:image", () => {
    const html = `<meta name="twitter:image" content="https://cdn.example.com/tw.jpg">`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates.some((c) => c.metadataSource === "twitter" && c.sourceUrl.endsWith("tw.jpg"))).toBe(true);
  });

  it("extracts a JSON-LD image given as a plain string", () => {
    const html = `<script type="application/ld+json">{"@type":"NewsArticle","image":"https://cdn.example.com/jsonld-string.jpg"}</script>`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates.some((c) => c.metadataSource === "jsonld" && c.sourceUrl.endsWith("jsonld-string.jpg"))).toBe(true);
  });

  it("extracts a JSON-LD ImageObject with url/width/height", () => {
    const html = `<script type="application/ld+json">
      {"@type":"NewsArticle","image":{"@type":"ImageObject","url":"https://cdn.example.com/obj.jpg","width":1600,"height":900}}
    </script>`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    const jsonld = candidates.find((c) => c.metadataSource === "jsonld");
    expect(jsonld?.sourceUrl).toBe("https://cdn.example.com/obj.jpg");
    expect(jsonld?.width).toBe(1600);
    expect(jsonld?.height).toBe(900);
  });

  it("extracts a JSON-LD image array of ImageObjects", () => {
    const html = `<script type="application/ld+json">
      {"@type":"NewsArticle","image":[{"url":"https://cdn.example.com/a.jpg"},{"url":"https://cdn.example.com/b.jpg"}]}
    </script>`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    const urls = candidates.filter((c) => c.metadataSource === "jsonld").map((c) => c.sourceUrl);
    expect(urls).toContain("https://cdn.example.com/a.jpg");
    expect(urls).toContain("https://cdn.example.com/b.jpg");
  });

  it("finds JSON-LD image one level inside @graph", () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebPage"},{"@type":"NewsArticle","image":"https://cdn.example.com/graph.jpg"}]}
    </script>`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates.some((c) => c.sourceUrl.endsWith("graph.jpg"))).toBe(true);
  });

  it("never throws on malformed JSON-LD — skips it and keeps going", () => {
    const html = `<script type="application/ld+json">{ not valid json at all </script>
      <meta property="og:image" content="https://cdn.example.com/still-works.jpg">`;
    expect(() => extractImageCandidates(html, ARTICLE_URL)).not.toThrow();
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates.some((c) => c.sourceUrl.endsWith("still-works.jpg"))).toBe(true);
  });

  it("falls back to a conservative <img> tag scan when nothing else is present", () => {
    const html = `<body><article><img src="/img/body-photo.jpg" alt="A photo" width="640" height="360"></article></body>`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    const imgTag = candidates.find((c) => c.metadataSource === "img-tag");
    expect(imgTag).toBeDefined();
    expect(imgTag!.sourceUrl).toBe("https://news.example.com/img/body-photo.jpg");
    expect(imgTag!.altText).toBe("A photo");
    expect(imgTag!.width).toBe(640);
    expect(imgTag!.height).toBe(360);
  });

  it("drops data: URLs — they can never be fetched through the SSRF-hardened downloader anyway", () => {
    const html = `<img src="data:image/png;base64,iVBORw0KGgoAAAA">`;
    expect(extractImageCandidates(html, ARTICLE_URL)).toEqual([]);
  });

  it("returns an empty array for a page with no images at all", () => {
    expect(extractImageCandidates("<html><body><p>No images here.</p></body></html>", ARTICLE_URL)).toEqual([]);
  });

  it("never throws on garbage HTML", () => {
    expect(() => extractImageCandidates("<<<not>>> <html broken", ARTICLE_URL)).not.toThrow();
    expect(() => extractImageCandidates("", ARTICLE_URL)).not.toThrow();
  });

  it("returns an empty array when the article URL itself is unparsable", () => {
    expect(extractImageCandidates("<meta property=\"og:image\" content=\"https://cdn.example.com/x.jpg\">", "not a url")).toEqual([]);
  });
});
