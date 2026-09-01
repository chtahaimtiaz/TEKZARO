import "server-only";

export class SearchProviderNotConfiguredError extends Error {
  constructor() {
    super("Web search requires SEARCH_API_KEY to be configured in .env.");
    this.name = "SearchProviderNotConfiguredError";
  }
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function isSearchConfigured(): boolean {
  return Boolean(process.env.SEARCH_API_KEY);
}

interface TavilySearchResultItem {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilySearchResponse {
  results?: TavilySearchResultItem[];
}

/**
 * Calls Tavily's Search API directly via fetch — same "documented HTTP API
 * over an unverified package" choice as lib/ai/provider.ts. search_depth is
 * pinned to "basic" (1 credit/call) rather than left to default — "advanced"
 * costs 2 credits, and this is called at most VERIFY_BATCH_SIZE times per
 * hourly cron run, so the cost of an unreviewed default matters. Throws
 * SearchProviderNotConfiguredError if SEARCH_API_KEY isn't set — callers
 * must handle that and record an honest "not configured" state, never
 * fabricate results.
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.SEARCH_API_KEY;
  if (!apiKey) throw new SearchProviderNotConfiguredError();

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 5 }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Search provider request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as TavilySearchResponse;
  const results = data.results ?? [];
  return results
    .filter((item): item is Required<TavilySearchResultItem> => Boolean(item.title && item.url))
    .map((item) => ({ title: item.title, url: item.url, snippet: item.content ?? "" }));
}
