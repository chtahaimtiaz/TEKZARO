import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createHash } from "node:crypto";

const safeFetchMock = vi.fn();
const safeFetchBinaryMock = vi.fn();
vi.mock("../lib/security/safe-fetch", () => ({
  safeFetch: safeFetchMock,
  safeFetchBinary: safeFetchBinaryMock,
  UnsafeUrlError: class UnsafeUrlError extends Error {},
  ResponseTooLargeError: class ResponseTooLargeError extends Error {},
}));

const saveUploadMock = vi.fn();
vi.mock("../lib/media/storage", () => ({
  saveUpload: saveUploadMock,
}));

const { acquireImageForSourceItem } = await import("../lib/images/acquire");
const { featuredImageFieldsFor } = await import("../lib/images/featured-image");
const { isPublishableReuseStatus } = await import("../lib/publication-checks");
const { clearRobotsCache } = await import("../lib/ingestion/robots");
const { prisma } = await import("../lib/prisma");
const { getSystemUserId } = await import("../lib/system-actor");
const { buildMinimalJpeg } = await import("./helpers");

const ARTICLE_URL = "https://news.example.com/story/headline";

function okText(text: string) {
  return { status: 200, headers: new Headers(), text, finalUrl: ARTICLE_URL };
}
function notFoundText() {
  return { status: 404, headers: new Headers(), text: "", finalUrl: ARTICLE_URL };
}
function okBytes(bytes: Buffer, url: string) {
  return { status: 200, headers: new Headers(), bytes, finalUrl: url };
}

const createdSourceIds: string[] = [];
const createdMediaIds: string[] = [];

async function makeSourceItem(sourceUrl: string, headline = "A test headline") {
  const source = await prisma.source.create({
    data: { name: `Image test source ${Date.now()}`, url: "https://news.example.com", type: "RSS", tier: "TIER_2" },
  });
  createdSourceIds.push(source.id);
  return prisma.sourceItem.create({
    data: { sourceId: source.id, sourceUrl, headline, normalizedTitle: headline.toLowerCase() },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  clearRobotsCache();
  // Default: every URL 404s (robots.txt included, which fails open to
  // "allowed") — each test overrides whichever URLs it actually cares about.
  safeFetchMock.mockImplementation(async () => notFoundText());
});

afterAll(async () => {
  if (createdMediaIds.length) await prisma.media.deleteMany({ where: { id: { in: createdMediaIds } } });
  if (createdSourceIds.length) await prisma.source.deleteMany({ where: { id: { in: createdSourceIds } } });
});

describe("acquireImageForSourceItem", () => {
  it("acquires the best-ranked candidate, stores it, and records full provenance", async () => {
    const item = await makeSourceItem("https://news.example.com/story/full-provenance");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt") ? notFoundText() : okText(`<link rel="license" href="https://creativecommons.org/licenses/by/4.0/"><meta property="og:image" content="https://cdn.example.com/hero.jpg">`),
    );
    safeFetchBinaryMock.mockResolvedValue(okBytes(buildMinimalJpeg(1200, 675), "https://cdn.example.com/hero.jpg"));
    saveUploadMock.mockResolvedValue({ url: "https://blob.example/stored/hero.jpg" });

    const result = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });
    expect(result.ok).toBe(true);
    expect(result.mediaId).toBeDefined();
    createdMediaIds.push(result.mediaId!);

    const media = await prisma.media.findUniqueOrThrow({ where: { id: result.mediaId! } });
    expect(media.url).toBe("https://blob.example/stored/hero.jpg");
    expect(media.sourceItemId).toBe(item.id);
    expect(media.sourceUrl).toBe("https://cdn.example.com/hero.jpg");
    expect(media.sourceArticleUrl).toBe(item.sourceUrl);
    expect(media.sourceDomain).toBe("news.example.com");
    expect(media.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // The page carries an explicit CC grant, so the image is storable and
    // publishable. An unlicensed page is covered by its own test below,
    // where nothing is stored at all.
    expect(media.reuseStatus).toBe("LICENSED");
    expect(media.selectionScore).toBeGreaterThan(0);
    expect(media.selectionReasons).toBeTruthy();
    expect(media.width).toBe(1200);
    expect(media.height).toBe(675);
    expect(media.mimeType).toBe("image/jpeg");
    expect(media.uploadedById).toBe(await getSystemUserId());

    const updatedItem = await prisma.sourceItem.findUniqueOrThrow({ where: { id: item.id } });
    const rawMetadata = updatedItem.rawMetadata as { imageCandidates?: { selected: boolean }[] } | null;
    expect(rawMetadata?.imageCandidates?.length).toBeGreaterThan(0);
    expect(rawMetadata?.imageCandidates?.some((c) => c.selected)).toBe(true);
  });

  it("assigns LICENSED only when the source page carries an explicit Creative Commons grant", async () => {
    const item = await makeSourceItem("https://news.example.com/story/licensed");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt")
        ? notFoundText()
        : okText(
            `<link rel="license" href="https://creativecommons.org/licenses/by/4.0/">
             <meta property="og:image" content="https://cdn.example.com/licensed.jpg">`,
          ),
    );
    safeFetchBinaryMock.mockResolvedValue(okBytes(buildMinimalJpeg(1000, 600), "https://cdn.example.com/licensed.jpg"));
    saveUploadMock.mockResolvedValue({ url: "https://blob.example/stored/licensed.jpg" });

    const result = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });
    expect(result.ok).toBe(true);
    createdMediaIds.push(result.mediaId!);
    const media = await prisma.media.findUniqueOrThrow({ where: { id: result.mediaId! } });
    expect(media.reuseStatus).toBe("LICENSED");
  });

  it("falls back to the next-ranked candidate when the top one fails to download", async () => {
    const item = await makeSourceItem("https://news.example.com/story/fallback");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt")
        ? notFoundText()
        : okText(
            `<link rel="license" href="https://creativecommons.org/licenses/by/4.0/"><meta property="og:image" content="https://cdn.example.com/top-pick.jpg">
             <img src="https://cdn.example.com/fallback-pick.jpg" alt="fallback" width="800" height="450">`,
          ),
    );
    safeFetchBinaryMock.mockImplementation(async (url: string) => {
      if (url === "https://cdn.example.com/top-pick.jpg") throw new Error("simulated network failure");
      return okBytes(buildMinimalJpeg(800, 450), url);
    });
    saveUploadMock.mockResolvedValue({ url: "https://blob.example/stored/fallback.jpg" });

    const result = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });
    expect(result.ok).toBe(true);
    createdMediaIds.push(result.mediaId!);
    const media = await prisma.media.findUniqueOrThrow({ where: { id: result.mediaId! } });
    expect(media.sourceUrl).toBe("https://cdn.example.com/fallback-pick.jpg");

    const updatedItem = await prisma.sourceItem.findUniqueOrThrow({ where: { id: item.id } });
    const rawMetadata = updatedItem.rawMetadata as { imageCandidates?: { rejected?: string; selected: boolean }[] } | null;
    expect(rawMetadata?.imageCandidates).toHaveLength(2);
    expect(rawMetadata!.imageCandidates![0].rejected).toBeTruthy();
    expect(rawMetadata!.imageCandidates![1].selected).toBe(true);
  });

  it("falls back to the next candidate when downloaded content isn't a recognized image format", async () => {
    const item = await makeSourceItem("https://news.example.com/story/bad-format");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt")
        ? notFoundText()
        : okText(
            `<link rel="license" href="https://creativecommons.org/licenses/by/4.0/"><meta property="og:image" content="https://cdn.example.com/not-an-image.jpg">
             <img src="https://cdn.example.com/real-photo.jpg" alt="real" width="640" height="360">`,
          ),
    );
    safeFetchBinaryMock.mockImplementation(async (url: string) => {
      if (url === "https://cdn.example.com/not-an-image.jpg") {
        return okBytes(Buffer.from("<html>this is not an image</html>"), url);
      }
      return okBytes(buildMinimalJpeg(640, 360), url);
    });
    saveUploadMock.mockResolvedValue({ url: "https://blob.example/stored/real-photo.jpg" });

    const result = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });
    expect(result.ok).toBe(true);
    createdMediaIds.push(result.mediaId!);
    const media = await prisma.media.findUniqueOrThrow({ where: { id: result.mediaId! } });
    expect(media.sourceUrl).toBe("https://cdn.example.com/real-photo.jpg");
  });

  it("deduplicates by content hash — reuses an existing Media row instead of uploading again", async () => {
    const bytes = buildMinimalJpeg(500, 500);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const systemUserId = await getSystemUserId();
    const existing = await prisma.media.create({
      data: {
        url: "https://blob.example/preexisting.jpg",
        altText: "Pre-existing",
        filename: "preexisting.jpg",
        mimeType: "image/jpeg",
        sizeBytes: bytes.length,
        uploadedById: systemUserId,
        contentHash: hash,
        reuseStatus: "REQUIRES_REVIEW",
      },
    });
    createdMediaIds.push(existing.id);

    const item = await makeSourceItem("https://news.example.com/story/dedup");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt") ? notFoundText() : okText(`<link rel="license" href="https://creativecommons.org/licenses/by/4.0/"><meta property="og:image" content="https://cdn.example.com/dup.jpg">`),
    );
    safeFetchBinaryMock.mockResolvedValue(okBytes(bytes, "https://cdn.example.com/dup.jpg"));

    const result = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });
    expect(result.ok).toBe(true);
    expect(result.mediaId).toBe(existing.id);
    expect(saveUploadMock).not.toHaveBeenCalled();

    const claimed = await prisma.media.findUniqueOrThrow({ where: { id: existing.id } });
    expect(claimed.sourceItemId).toBe(item.id);
  });

  it("never fails — returns ok:false with a reason when the page has no usable image", async () => {
    const item = await makeSourceItem("https://news.example.com/story/no-image");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt") ? notFoundText() : okText(`<html><body><p>No images here.</p></body></html>`),
    );

    const result = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(safeFetchBinaryMock).not.toHaveBeenCalled();
  });

  it("honors robots.txt disallow and never fetches the article page at all", async () => {
    const item = await makeSourceItem("https://news.example.com/story/robots-blocked");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt") ? { status: 200, headers: new Headers(), text: "User-agent: *\nDisallow: /", finalUrl: url } : okText("should never be reached"),
    );

    const result = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/robots/i);
    expect(safeFetchMock).toHaveBeenCalledTimes(1); // robots.txt only, never the article page
    expect(safeFetchBinaryMock).not.toHaveBeenCalled();
  });

  it("never throws even when the underlying fetch throws unexpectedly", async () => {
    const item = await makeSourceItem("https://news.example.com/story/unexpected-error");
    safeFetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/robots.txt")) return notFoundText();
      throw new Error("simulated unexpected network error");
    });

    await expect(
      acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline }),
    ).resolves.toEqual(expect.objectContaining({ ok: false }));
  });
});

describe("acquireImageForSourceItem — reuse status decides publishability, not storage", () => {
  it("stores an unlicensed image as REQUIRES_REVIEW rather than discarding it", async () => {
    // Blocking storage outright here was tried and reverted: it starved the
    // editor review queue, so every new article published with no image at
    // all. Storing it is safe because reuseStatus, not the presence of the
    // row, is what gates publication — see the featuredImageFieldsFor test
    // below and the image-rights publication check.
    const item = await makeSourceItem("https://news.example.com/story/unlicensed");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt")
        ? notFoundText()
        : okText(`<meta property="og:image" content="https://cdn.example.com/copyrighted.jpg">`),
    );
    safeFetchBinaryMock.mockResolvedValue(okBytes(buildMinimalJpeg(1216, 684), "https://cdn.example.com/copyrighted.jpg"));
    saveUploadMock.mockResolvedValue({ url: "https://blob.example/stored/unlicensed.jpg" });

    const result = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });

    expect(result.ok).toBe(true);
    createdMediaIds.push(result.mediaId!);
    expect(result.reuseStatus).toBe("REQUIRES_REVIEW");

    // Stored, but honestly marked — never silently upgraded to publishable.
    const media = await prisma.media.findUniqueOrThrow({ where: { id: result.mediaId! } });
    expect(isPublishableReuseStatus(media.reuseStatus)).toBe(false);
  });

  it("does not expose a REQUIRES_REVIEW image as an article's rendered featured image", async () => {
    // The actual safety boundary: featuredMediaId is set so an editor sees
    // "found, needs review", but featuredImageUrl — the field the public
    // site renders — stays null until a human clears the image.
    const item = await makeSourceItem("https://news.example.com/story/needs-review");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt")
        ? notFoundText()
        : okText(`<meta property="og:image" content="https://cdn.example.com/review.jpg">`),
    );
    safeFetchBinaryMock.mockResolvedValue(okBytes(buildMinimalJpeg(1013, 607), "https://cdn.example.com/review.jpg"));
    saveUploadMock.mockResolvedValue({ url: "https://blob.example/stored/review.jpg" });

    const acquired = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });
    createdMediaIds.push(acquired.mediaId!);

    const fields = await featuredImageFieldsFor(item.id);
    expect(fields.featuredMediaId).toBe(acquired.mediaId);
    expect(fields.featuredImageUrl).toBeNull();
    expect(fields.featuredImageAlt).toBeNull();
  });

  it("acquires lazily — featuredImageFieldsFor fetches an image that ingestion never stored", async () => {
    // Acquisition no longer runs for every ingested item; it runs when an
    // item genuinely becomes an article. So a source item with no Media row
    // must still end up with an image at conversion time.
    const item = await makeSourceItem("https://news.example.com/story/lazy");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt")
        ? notFoundText()
        : okText(
            `<link rel="license" href="https://creativecommons.org/licenses/by/4.0/">
             <meta property="og:image" content="https://cdn.example.com/lazy.jpg">`,
          ),
    );
    safeFetchBinaryMock.mockResolvedValue(okBytes(buildMinimalJpeg(1400, 800), "https://cdn.example.com/lazy.jpg"));
    saveUploadMock.mockResolvedValue({ url: "https://blob.example/stored/lazy.jpg" });

    expect(await prisma.media.count({ where: { sourceItemId: item.id } })).toBe(0);

    const fields = await featuredImageFieldsFor(item.id);

    expect(fields.featuredMediaId).toBeTruthy();
    createdMediaIds.push(fields.featuredMediaId!);
    // A real CC grant, so this one is publishable and does render.
    expect(fields.featuredImageUrl).toBe("https://blob.example/stored/lazy.jpg");
  });

  it("still stores when an explicit Creative Commons grant is present", async () => {
    const item = await makeSourceItem("https://news.example.com/story/cc-grant");
    safeFetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt")
        ? notFoundText()
        : okText(
            `<link rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/">
             <meta property="og:image" content="https://cdn.example.com/cc.jpg">`,
          ),
    );
    safeFetchBinaryMock.mockResolvedValue(okBytes(buildMinimalJpeg(900, 600), "https://cdn.example.com/cc.jpg"));
    saveUploadMock.mockResolvedValue({ url: "https://blob.example/stored/cc.jpg" });

    const result = await acquireImageForSourceItem({ id: item.id, sourceUrl: item.sourceUrl, headline: item.headline });
    expect(result.ok).toBe(true);
    createdMediaIds.push(result.mediaId!);
    expect(result.reuseStatus).toBe("LICENSED");
    expect(saveUploadMock).toHaveBeenCalled();
  });
});
