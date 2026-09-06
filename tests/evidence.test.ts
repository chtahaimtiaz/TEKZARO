import { describe, it, expect, beforeEach, vi } from "vitest";

const safeFetchMock = vi.fn();
vi.mock("../lib/security/safe-fetch", () => ({
  safeFetch: safeFetchMock,
  safeFetchBinary: vi.fn(),
  UnsafeUrlError: class UnsafeUrlError extends Error {},
  ResponseTooLargeError: class ResponseTooLargeError extends Error {},
}));

const isFetchAllowedMock = vi.fn();
vi.mock("../lib/ingestion/robots", () => ({
  isFetchAllowed: isFetchAllowedMock,
  clearRobotsCache: vi.fn(),
}));

const { gatherEvidence, formatEvidence } = await import("../lib/ai/evidence");

function page(body: string): string {
  return `<html><head><title>T</title></head><body><article>${body}</article></body></html>`;
}
/** Sized like a real extraction. Measured against live publishers, article
 * bodies came back between roughly 1,400 and 16,700 characters, so a fixture
 * of a few hundred would exercise the wrong richness tier. */
const LONG = (label: string) =>
  page(`<p>${label}. ` + "The organisation set out the change in detail, describing the timeline, the parties involved and the expected effect on customers across the region. ".repeat(20) + "</p>");

beforeEach(() => {
  vi.resetAllMocks();
  isFetchAllowedMock.mockResolvedValue(true);
  safeFetchMock.mockImplementation(async (url: string) => ({
    status: 200,
    headers: new Headers(),
    text: LONG(`Body of ${url}`),
    finalUrl: url,
  }));
});

describe("evidence gathering", () => {
  it("always gathers the originating outlet's own article", async () => {
    // Previously the originating page was never fetched for verification even
    // though the image pipeline already fetched it — the single most reliably
    // available document was going unused.
    const b = await gatherEvidence({ originatingUrl: "https://techcrunch.com/2026/09/05/story/", searchResults: [] });
    expect(b.documents).toHaveLength(1);
    expect(b.documents[0].isOriginatingOutlet).toBe(true);
    expect(b.documents[0].hostname).toBe("techcrunch.com");
  });

  it("never lets the originating outlet corroborate itself", async () => {
    const b = await gatherEvidence({ originatingUrl: "https://www.apple.com/newsroom/2026/09/x/", searchResults: [] });
    // Apple's newsroom is a primary source, but not for its own story.
    expect(b.primary).toBeNull();
    expect(b.corroborating).toBeNull();
  });

  it("prefers a primary source over a specialist one regardless of search order", async () => {
    const b = await gatherEvidence({
      originatingUrl: "https://www.engadget.com/story",
      searchResults: [
        { title: "specialist", url: "https://arstechnica.com/2026/09/a/", snippet: "" },
        { title: "regulator", url: "https://www.sec.gov/filings/x", snippet: "" },
      ],
    });
    expect(b.primary?.hostname).toBe("sec.gov");
    expect(b.corroborating?.hostname).toBe("arstechnica.com");
  });

  it("skips aggregators entirely rather than counting them as corroboration", async () => {
    const b = await gatherEvidence({
      originatingUrl: "https://www.engadget.com/story",
      searchResults: [{ title: "agg", url: "https://news.google.com/rss/articles/XYZ", snippet: "" }],
    });
    expect(b.documents.every((d) => d.hostname !== "news.google.com")).toBe(true);
    expect(b.corroborating).toBeNull();
  });

  it("never returns two documents from the same host", async () => {
    const b = await gatherEvidence({
      originatingUrl: "https://arstechnica.com/a",
      searchResults: [
        { title: "same host", url: "https://arstechnica.com/b", snippet: "" },
        { title: "other", url: "https://www.reuters.com/c", snippet: "" },
      ],
    });
    const hosts = b.documents.map((d) => d.hostname);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it("rejects a page that yields too little text to be an article", async () => {
    safeFetchMock.mockImplementation(async (url: string) => ({
      status: 200, headers: new Headers(), text: page("<p>Subscribe to continue reading this article.</p>"), finalUrl: url,
    }));
    const b = await gatherEvidence({ originatingUrl: "https://techcrunch.com/x", searchResults: [] });
    expect(b.documents).toHaveLength(0);
    expect(b.richness).toBe("THIN");
    expect(b.notes.join(" ")).toMatch(/chars recovered/);
  });

  it("records robots.txt refusals without throwing", async () => {
    isFetchAllowedMock.mockResolvedValue(false);
    const b = await gatherEvidence({ originatingUrl: "https://techcrunch.com/x", searchResults: [] });
    expect(b.documents).toHaveLength(0);
    expect(b.notes.join(" ")).toMatch(/robots\.txt/);
  });

  it("survives an HTTP error on one candidate and keeps the others", async () => {
    safeFetchMock.mockImplementation(async (url: string) =>
      url.includes("reuters")
        ? { status: 403, headers: new Headers(), text: "", finalUrl: url }
        : { status: 200, headers: new Headers(), text: LONG("ok"), finalUrl: url },
    );
    const b = await gatherEvidence({
      originatingUrl: "https://techcrunch.com/x",
      searchResults: [{ title: "r", url: "https://www.reuters.com/y", snippet: "" }],
    });
    expect(b.documents).toHaveLength(1);
    expect(b.notes.join(" ")).toMatch(/403/);
  });

  it("classifies richness from how much was actually recovered", async () => {
    const thin = await gatherEvidence({ originatingUrl: "https://news.google.com/x", searchResults: [] });
    expect(thin.richness).toBe("THIN");

    const rich = await gatherEvidence({
      originatingUrl: "https://www.engadget.com/story",
      searchResults: [
        { title: "gov", url: "https://www.sec.gov/filings/x", snippet: "" },
        { title: "wire", url: "https://www.reuters.com/y", snippet: "" },
      ],
    });
    expect(rich.documents.length).toBeGreaterThanOrEqual(2);
    expect(["RICH", "VERY_RICH"]).toContain(rich.richness);
  });

  it("labels each document separately so claims stay attributable", async () => {
    const b = await gatherEvidence({
      originatingUrl: "https://www.engadget.com/story",
      searchResults: [{ title: "gov", url: "https://www.sec.gov/filings/x", snippet: "" }],
    });
    const rendered = formatEvidence(b);
    expect(rendered).toContain("SOURCE 1");
    expect(rendered).toContain("SOURCE 2");
    expect(rendered).toContain("PRIMARY");
    expect(rendered).toContain("cannot corroborate itself");
    // The model is told to surface disagreement rather than silently pick.
    expect(rendered).toMatch(/disagree/i);
  });

  it("tells the model plainly when nothing could be retrieved", async () => {
    isFetchAllowedMock.mockResolvedValue(false);
    const b = await gatherEvidence({ originatingUrl: "https://techcrunch.com/x", searchResults: [] });
    const rendered = formatEvidence(b);
    expect(rendered).toMatch(/No source material could be retrieved/i);
    expect(rendered).toMatch(/draft: null/);
  });
});
