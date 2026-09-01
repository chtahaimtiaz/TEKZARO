import { describe, it, expect, beforeEach, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { isSearchConfigured, searchWeb, SearchProviderNotConfiguredError } = await import("../lib/search/web-search");

const ORIGINAL_KEY = process.env.SEARCH_API_KEY;

beforeEach(() => {
  fetchMock.mockClear();
  process.env.SEARCH_API_KEY = ORIGINAL_KEY;
});

describe("isSearchConfigured", () => {
  it("is false when SEARCH_API_KEY is unset, true when set", () => {
    process.env.SEARCH_API_KEY = "";
    expect(isSearchConfigured()).toBe(false);

    process.env.SEARCH_API_KEY = "tvly-a-key";
    expect(isSearchConfigured()).toBe(true);
  });
});

describe("searchWeb — not configured", () => {
  it("throws SearchProviderNotConfiguredError without ever calling fetch", async () => {
    process.env.SEARCH_API_KEY = "";
    await expect(searchWeb("test query")).rejects.toBeInstanceOf(SearchProviderNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchWeb — configured (mocked fetch, no real network/API call)", () => {
  beforeEach(() => {
    process.env.SEARCH_API_KEY = "tvly-a-key";
  });

  it("maps a normal response's results to WebSearchResult[], using basic search_depth", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { title: "Result One", url: "https://example.test/one", content: "First snippet." },
          { title: "Result Two", url: "https://example.test/two", content: "Second snippet." },
        ],
      }),
    });

    const results = await searchWeb("test query");
    expect(results).toEqual([
      { title: "Result One", url: "https://example.test/one", snippet: "First snippet." },
      { title: "Result Two", url: "https://example.test/two", snippet: "Second snippet." },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer tvly-a-key" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ query: "test query", search_depth: "basic", max_results: 5 });
  });

  it("returns [] when the response has no `results` field", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answer: null }), // no `results` key at all
    });

    const results = await searchWeb("a query with no results");
    expect(results).toEqual([]);
  });

  it("throws with status context on a non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid API key",
    });

    await expect(searchWeb("test query")).rejects.toThrow(/401/);
  });

  it("skips a malformed item missing title or url rather than throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { title: "Has both", url: "https://example.test/ok", content: "..." },
          { title: "Missing url" },
          { url: "https://example.test/missing-title" },
        ],
      }),
    });

    const results = await searchWeb("test query");
    expect(results).toEqual([{ title: "Has both", url: "https://example.test/ok", snippet: "..." }]);
  });
});
