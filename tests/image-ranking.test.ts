import { describe, it, expect } from "vitest";
import { rejectionReason, scoreCandidate, rankImageCandidates } from "../lib/images/filter-rank";
import type { ImageCandidate } from "../lib/images/extract";

function candidate(overrides: Partial<ImageCandidate>): ImageCandidate {
  return {
    sourceUrl: "https://cdn.example.com/photo.jpg",
    sourceArticleUrl: "https://news.example.com/story",
    sourceDomain: "news.example.com",
    metadataSource: "og",
    ...overrides,
  };
}

describe("rejectionReason", () => {
  it("rejects URLs whose path suggests a non-editorial image", () => {
    for (const url of [
      "https://cdn.example.com/assets/logo.png",
      "https://cdn.example.com/author/avatar-42.jpg",
      "https://cdn.example.com/icons/icon-share.svg",
      "https://cdn.example.com/tracking/pixel.gif",
      "https://cdn.example.com/js/sprite.png",
      "https://cdn.example.com/ads/banner.jpg",
      "https://cdn.example.com/story/thumb-small.jpg",
      "https://cdn.example.com/gdpr/cookie-banner.png",
      "https://cdn.example.com/placeholder.jpg",
    ]) {
      expect(rejectionReason(candidate({ sourceUrl: url }))).not.toBeNull();
    }
  });

  it("does NOT reject ordinary filenames that merely contain a negative keyword as a substring", () => {
    // Proves the \b word-boundary matching: "ad" must not fire on words
    // that merely contain those two letters glued to other letters.
    for (const url of [
      "https://cdn.example.com/download-app-launch.jpg",
      "https://cdn.example.com/canada-trade-deal.jpg",
      "https://cdn.example.com/stadium-crowd.jpg",
      "https://cdn.example.com/leader-visits-factory.jpg",
    ]) {
      expect(rejectionReason(candidate({ sourceUrl: url }))).toBeNull();
    }
  });

  it("rejects declared dimensions below the minimum", () => {
    expect(rejectionReason(candidate({ width: 40, height: 40 }))).not.toBeNull();
    expect(rejectionReason(candidate({ width: 800, height: 20 }))).not.toBeNull();
  });

  it("rejects extreme aspect ratios (thin banners/rails)", () => {
    expect(rejectionReason(candidate({ width: 1000, height: 100 }))).not.toBeNull(); // 10:1
    expect(rejectionReason(candidate({ width: 100, height: 1000 }))).not.toBeNull(); // 1:10
  });

  it("accepts a normal editorial photo", () => {
    expect(rejectionReason(candidate({ sourceUrl: "https://cdn.example.com/newsroom/city-skyline.jpg", width: 1200, height: 675 }))).toBeNull();
  });

  it("accepts a candidate with no declared dimensions at all — unknown isn't rejected", () => {
    expect(rejectionReason(candidate({ width: undefined, height: undefined }))).toBeNull();
  });
});

describe("scoreCandidate", () => {
  it("ranks metadata sources og > jsonld > twitter > img-tag, all else equal", () => {
    const og = scoreCandidate(candidate({ metadataSource: "og" }));
    const jsonld = scoreCandidate(candidate({ metadataSource: "jsonld" }));
    const twitter = scoreCandidate(candidate({ metadataSource: "twitter" }));
    const imgTag = scoreCandidate(candidate({ metadataSource: "img-tag" }));
    expect(og.score).toBeGreaterThan(jsonld.score);
    expect(jsonld.score).toBeGreaterThan(twitter.score);
    expect(twitter.score).toBeGreaterThan(imgTag.score);
  });

  it("gives every point a plain-English reason", () => {
    const result = scoreCandidate(candidate({ width: 1600, height: 900, altText: "A descriptive caption" }));
    expect(result.reasons.length).toBeGreaterThan(1);
    expect(result.reasons.every((r) => r.length > 0)).toBe(true);
  });

  it("scores higher resolution above lower resolution", () => {
    const big = scoreCandidate(candidate({ width: 1920, height: 1080 }));
    const small = scoreCandidate(candidate({ width: 300, height: 169 }));
    expect(big.score).toBeGreaterThan(small.score);
  });

  it("gives a landscape aspect ratio a bonus that a square image in the same resolution tier doesn't get", () => {
    const landscape = scoreCandidate(candidate({ width: 1200, height: 675 })); // area 810000, 1.78:1
    const square = scoreCandidate(candidate({ width: 900, height: 900 })); // area 810000, 1:1 — same resolution tier
    expect(landscape.score).toBeGreaterThan(square.score);
  });

  it("does not penalize a candidate with unknown dimensions relative to the same candidate with no other signal", () => {
    const unknown = scoreCandidate(candidate({ width: undefined, height: undefined }));
    expect(unknown.score).toBeGreaterThan(0); // still gets its metadata-source points
  });
});

describe("rankImageCandidates", () => {
  it("filters out rejected candidates entirely and sorts survivors best-first", () => {
    const candidates: ImageCandidate[] = [
      candidate({ sourceUrl: "https://cdn.example.com/logo.png", metadataSource: "img-tag" }), // rejected
      candidate({ sourceUrl: "https://cdn.example.com/small-thumb.jpg", metadataSource: "og", width: 40, height: 40 }), // rejected (size)
      candidate({ sourceUrl: "https://cdn.example.com/body-photo.jpg", metadataSource: "img-tag", width: 800, height: 450 }),
      candidate({ sourceUrl: "https://cdn.example.com/hero.jpg", metadataSource: "og", width: 1200, height: 675 }),
    ];
    const ranked = rankImageCandidates(candidates);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].candidate.sourceUrl).toBe("https://cdn.example.com/hero.jpg");
    expect(ranked[1].candidate.sourceUrl).toBe("https://cdn.example.com/body-photo.jpg");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("returns an empty array when every candidate is rejected", () => {
    expect(rankImageCandidates([candidate({ sourceUrl: "https://cdn.example.com/icon.png" })])).toEqual([]);
  });

  it("returns an empty array for no candidates", () => {
    expect(rankImageCandidates([])).toEqual([]);
  });
});
