import "server-only";
import { readEnvSecret } from "../env-secret";

export class SearchProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "Web search requires a search provider key. Set SEARCH_API_KEY (Tavily), or GEMINI_API_KEY / GOOGLE_AI_KEY (Google Search Grounding).",
    );
    this.name = "SearchProviderNotConfiguredError";
  }
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface TavilySearchResultItem {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilySearchResponse {
  results?: TavilySearchResultItem[];
}

function getGeminiKey(): string | undefined {
  return (
    readEnvSecret("GEMINI_API_KEY") ||
    readEnvSecret("GOOGLE_AI_KEY") ||
    readEnvSecret("GOOGLE_API_KEY") ||
    (readEnvSecret("SEARCH_API_KEY")?.startsWith("AIza") ? readEnvSecret("SEARCH_API_KEY") : undefined)
  );
}

function getTavilyKey(): string | undefined {
  const searchKey = readEnvSecret("SEARCH_API_KEY");
  const explicitTavilyKey = readEnvSecret("TAVILY_API_KEY");
  if (explicitTavilyKey) return explicitTavilyKey;
  if (searchKey && !searchKey.startsWith("AIza")) return searchKey;
  return undefined;
}

function getGoogleCse(): { key: string; cx: string } | null {
  const key = readEnvSecret("GOOGLE_SEARCH_API_KEY");
  const cx = readEnvSecret("GOOGLE_SEARCH_CX");
  return key && cx ? { key, cx } : null;
}

export function isSearchConfigured(): boolean {
  return Boolean(getTavilyKey() || getGeminiKey() || getGoogleCse());
}

async function searchWithTavily(apiKey: string, query: string): Promise<WebSearchResult[]> {
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
    if (response.status === 432 || body.includes("usage limit")) {
      throw new Error(
        `Tavily search quota exceeded (HTTP 432). Upgrade your Tavily plan, add a fresh key from https://tavily.com, or configure GEMINI_API_KEY for Google Search Grounding. Details: ${body.slice(0, 200)}`,
      );
    }
    throw new Error(`Search provider request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as TavilySearchResponse;
  const results = data.results ?? [];
  return results
    .filter((item): item is Required<TavilySearchResultItem> => Boolean(item.title && item.url))
    .map((item) => ({ title: item.title, url: item.url, snippet: item.content ?? "" }));
}

async function searchWithGemini(apiKey: string, query: string): Promise<WebSearchResult[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Search Google for recent news and primary sources about: ${query}. Return relevant article titles and URLs.`,
            },
          ],
        },
      ],
      tools: [{ google_search: {} }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Search Grounding failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as any;
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const results: WebSearchResult[] = [];

  for (const chunk of chunks) {
    if (chunk.web?.uri && chunk.web?.title) {
      results.push({
        title: chunk.web.title,
        url: chunk.web.uri,
        snippet: chunk.web.title,
      });
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped: WebSearchResult[] = [];
  for (const r of results) {
    if (!seen.has(r.url)) {
      seen.add(r.url);
      deduped.push(r);
    }
  }

  return deduped;
}

async function searchWithGoogleCse(key: string, cx: string, query: string): Promise<WebSearchResult[]> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=5`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Custom Search failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as any;
  const items = data.items ?? [];
  return items.map((item: any) => ({
    title: item.title ?? "",
    url: item.link ?? "",
    snippet: item.snippet ?? "",
  }));
}

/**
 * Searches the web for fresh news and evidence.
 * Supports:
 * - Google Gemini Grounding (GEMINI_API_KEY, GOOGLE_AI_KEY, or Google key in SEARCH_API_KEY)
 * - Tavily Search API (SEARCH_API_KEY with tvly- key, or TAVILY_API_KEY)
 * - Google Custom Search API (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX)
 * Automatically falls back to Google Gemini Grounding if Tavily hits quota limits.
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const tavilyKey = getTavilyKey();
  const geminiKey = getGeminiKey();
  const googleCse = getGoogleCse();

  if (!tavilyKey && !geminiKey && !googleCse) {
    throw new SearchProviderNotConfiguredError();
  }

  // 1. If Google Gemini key is explicitly configured and Tavily is absent or a known exhausted default
  if (geminiKey && (!tavilyKey || tavilyKey.startsWith("tvly-default"))) {
    return searchWithGemini(geminiKey, query);
  }

  // 2. If Tavily key is present, try it first
  if (tavilyKey) {
    try {
      return await searchWithTavily(tavilyKey, query);
    } catch (err) {
      // If Tavily fails (e.g. 432 plan usage limit) and Gemini is available, fall back cleanly
      if (geminiKey) {
        return await searchWithGemini(geminiKey, query);
      }
      throw err;
    }
  }

  // 3. If Google Custom Search Engine is configured
  if (googleCse) {
    return searchWithGoogleCse(googleCse.key, googleCse.cx, query);
  }

  // 4. Default to Gemini if present
  if (geminiKey) {
    return searchWithGemini(geminiKey, query);
  }

  throw new SearchProviderNotConfiguredError();
}
