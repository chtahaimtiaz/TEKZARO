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

describe("srcset and lazy-load resolution", () => {
  it("picks the highest-width candidate out of a srcset attribute", () => {
    const html = `<img srcset="/img/small.jpg 320w, /img/medium.jpg 768w, /img/large.jpg 1600w" alt="Responsive">`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    const c = candidates.find((c) => c.metadataSource === "img-tag");
    expect(c?.sourceUrl).toBe("https://news.example.com/img/large.jpg");
    expect(c?.width).toBe(1600);
  });

  it("picks the highest-density candidate when srcset uses x descriptors instead of widths", () => {
    const html = `<img srcset="/img/1x.jpg 1x, /img/2x.jpg 2x, /img/3x.jpg 3x">`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates[0]?.sourceUrl).toBe("https://news.example.com/img/3x.jpg");
  });

  it("falls back to srcset when there is no plain src at all", () => {
    // A real, increasingly common pattern: an <img> that never sets src,
    // only srcset — this previously yielded zero candidates for the image.
    const html = `<img srcset="/img/only-responsive.jpg 800w" alt="No plain src">`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates.some((c) => c.sourceUrl === "https://news.example.com/img/only-responsive.jpg")).toBe(true);
  });

  it("uses data-src when src is a lazy-load placeholder", () => {
    const html = `<img src="data:image/gif;base64,R0lGOD" data-src="/img/real-photo.jpg" alt="Real photo">`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    const c = candidates.find((c) => c.metadataSource === "img-tag");
    expect(c?.sourceUrl).toBe("https://news.example.com/img/real-photo.jpg");
  });

  it("uses data-src when src points at a filename that is obviously a spacer/placeholder", () => {
    const html = `<img src="/assets/placeholder.gif" data-src="/img/actual-content.jpg">`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates.some((c) => c.sourceUrl === "https://news.example.com/img/actual-content.jpg")).toBe(true);
  });

  it("prefers a real src over srcset/data-src when the src is already usable", () => {
    const html = `<img src="/img/primary.jpg" data-src="/img/should-not-be-used.jpg" srcset="/img/also-not-used.jpg 800w">`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates.find((c) => c.metadataSource === "img-tag")?.sourceUrl).toBe("https://news.example.com/img/primary.jpg");
  });
});

describe("<figure> image extraction", () => {
  it("extracts an image inside a <figure>, ranked as its own metadataSource", () => {
    const html = `<figure><img src="/img/hero.jpg" alt="fallback alt" width="1200" height="675"><figcaption>The real editorial caption</figcaption></figure>`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    const figureCandidate = candidates.find((c) => c.metadataSource === "figure");
    expect(figureCandidate).toBeDefined();
    expect(figureCandidate!.sourceUrl).toBe("https://news.example.com/img/hero.jpg");
    expect(figureCandidate!.width).toBe(1200);
  });

  it("prefers the figcaption text over the img's own alt attribute", () => {
    const html = `<figure><img src="/img/hero.jpg" alt="fallback alt"><figcaption>A proper editorial caption</figcaption></figure>`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    const c = candidates.find((c) => c.metadataSource === "figure");
    expect(c?.altText).toBe("A proper editorial caption");
  });

  it("falls back to the img's alt attribute when there is no figcaption", () => {
    const html = `<figure><img src="/img/hero.jpg" alt="Only alt available"></figure>`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates.find((c) => c.metadataSource === "figure")?.altText).toBe("Only alt available");
  });

  it("resolves srcset inside a figure too, not only a plain src", () => {
    const html = `<figure><img srcset="/img/fig-small.jpg 400w, /img/fig-large.jpg 1600w"><figcaption>Caption</figcaption></figure>`;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    expect(candidates.find((c) => c.metadataSource === "figure")?.sourceUrl).toBe("https://news.example.com/img/fig-large.jpg");
  });

  it("does not crash on a figure with no image inside it", () => {
    const html = `<figure><figcaption>A caption with no image</figcaption></figure>`;
    expect(() => extractImageCandidates(html, ARTICLE_URL)).not.toThrow();
    expect(extractImageCandidates(html, ARTICLE_URL).some((c) => c.metadataSource === "figure")).toBe(false);
  });

  it("finds multiple figures on the same page", () => {
    const html = `
      <figure><img src="/img/first.jpg"><figcaption>First</figcaption></figure>
      <p>Some text in between.</p>
      <figure><img src="/img/second.jpg"><figcaption>Second</figcaption></figure>
    `;
    const candidates = extractImageCandidates(html, ARTICLE_URL).filter((c) => c.metadataSource === "figure");
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.sourceUrl)).toEqual([
      "https://news.example.com/img/first.jpg",
      "https://news.example.com/img/second.jpg",
    ]);
  });

  it("ranks a figure image above a bare img-tag image when both are candidates", () => {
    const html = `
      <figure><img src="/img/editorial-hero.jpg" width="1200" height="675"><figcaption>The hero image</figcaption></figure>
      <img src="/img/random-body-image.jpg" width="1200" height="675">
    `;
    const candidates = extractImageCandidates(html, ARTICLE_URL);
    const figureCandidate = candidates.find((c) => c.sourceUrl.includes("editorial-hero"));
    const bareCandidate = candidates.find((c) => c.sourceUrl.includes("random-body-image"));
    expect(figureCandidate?.metadataSource).toBe("figure");
    expect(bareCandidate?.metadataSource).toBe("img-tag");
  });
});
