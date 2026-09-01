import { describe, it, expect, beforeEach, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { isSearchConfigured, searchWeb, SearchProviderNotConfiguredError } = await import("../lib/search/web-search");

const ORIGINAL_KEY = process.env.SEARCH_API_KEY;
const ORIGINAL_ENGINE = process.env.GOOGLE_SEARCH_ENGINE_ID;

beforeEach(() => {
  fetchMock.mockClear();
  process.env.SEARCH_API_KEY = ORIGINAL_KEY;
  process.env.GOOGLE_SEARCH_ENGINE_ID = ORIGINAL_ENGINE;
});

describe("isSearchConfigured", () => {
  it("is false unless both SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID are set", () => {
    process.env.SEARCH_API_KEY = "";
    process.env.GOOGLE_SEARCH_ENGINE_ID = "";
    expect(isSearchConfigured()).toBe(false);

    process.env.SEARCH_API_KEY = "a-key";
    process.env.GOOGLE_SEARCH_ENGINE_ID = "";
    expect(isSearchConfigured()).toBe(false);

    process.env.SEARCH_API_KEY = "";
    process.env.GOOGLE_SEARCH_ENGINE_ID = "an-engine-id";
    expect(isSearchConfigured()).toBe(false);

    process.env.SEARCH_API_KEY = "a-key";
    process.env.GOOGLE_SEARCH_ENGINE_ID = "an-engine-id";
    expect(isSearchConfigured()).toBe(true);
  });
});

describe("searchWeb — not configured", () => {
  it("throws SearchProviderNotConfiguredError without ever calling fetch", async () => {
    process.env.SEARCH_API_KEY = "";
    process.env.GOOGLE_SEARCH_ENGINE_ID = "";
    await expect(searchWeb("test query")).rejects.toBeInstanceOf(SearchProviderNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchWeb — configured (mocked fetch, no real network/API call)", () => {
  beforeEach(() => {
    process.env.SEARCH_API_KEY = "a-key";
    process.env.GOOGLE_SEARCH_ENGINE_ID = "an-engine-id";
  });

  it("maps a normal response's items to WebSearchResult[]", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { title: "Result One", link: "https://example.test/one", snippet: "First snippet." },
          { title: "Result Two", link: "https://example.test/two", snippet: "Second snippet." },
        ],
      }),
    });

    const results = await searchWeb("test query");
    expect(results).toEqual([
      { title: "Result One", url: "https://example.test/one", snippet: "First snippet." },
      { title: "Result Two", url: "https://example.test/two", snippet: "Second snippet." },
    ]);

    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    expect(calledUrl.origin + calledUrl.pathname).toBe("https://www.googleapis.com/customsearch/v1");
    expect(calledUrl.searchParams.get("q")).toBe("test query");
  });

  it("returns [] on a zero-result response — Google omits `items` entirely rather than returning []", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ searchInformation: { totalResults: "0" } }), // no `items` key at all
    });

    const results = await searchWeb("a query with no results");
    expect(results).toEqual([]);
  });

  it("throws with status context on a non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "quota exceeded",
    });

    await expect(searchWeb("test query")).rejects.toThrow(/403/);
  });

  it("skips a malformed item missing title or link rather than throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { title: "Has both", link: "https://example.test/ok", snippet: "..." },
          { title: "Missing link" },
          { link: "https://example.test/missing-title" },
        ],
      }),
    });

    const results = await searchWeb("test query");
    expect(results).toEqual([{ title: "Has both", url: "https://example.test/ok", snippet: "..." }]);
  });
});
