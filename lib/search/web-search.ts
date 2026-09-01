import "server-only";

export class SearchProviderNotConfiguredError extends Error {
  constructor() {
    super("Web search requires SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID to be configured in .env.");
    this.name = "SearchProviderNotConfiguredError";
  }
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function isSearchConfigured(): boolean {
  return Boolean(process.env.SEARCH_API_KEY) && Boolean(process.env.GOOGLE_SEARCH_ENGINE_ID);
}

interface GoogleCustomSearchItem {
  title?: string;
  link?: string;
  snippet?: string;
}

interface GoogleCustomSearchResponse {
  items?: GoogleCustomSearchItem[];
}

/**
 * Calls Google's Custom Search JSON API directly via fetch — same
 * "documented HTTP API over an unverified package" choice as
 * lib/ai/provider.ts. Throws SearchProviderNotConfiguredError if either
 * credential is missing — callers must handle that and record an honest
 * "not configured" state, never fabricate results.
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.SEARCH_API_KEY;
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!apiKey || !engineId) throw new SearchProviderNotConfiguredError();

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", engineId);
  url.searchParams.set("q", query);

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Search provider request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as GoogleCustomSearchResponse;
  // Google omits `items` entirely on a zero-result query — never assume
  // it's present, even on a 200 response.
  const items = data.items ?? [];
  return items
    .filter((item): item is Required<GoogleCustomSearchItem> => Boolean(item.title && item.link))
    .map((item) => ({ title: item.title, url: item.link, snippet: item.snippet ?? "" }));
}
