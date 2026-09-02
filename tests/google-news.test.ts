import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { buildGoogleNewsQuery, buildGoogleNewsSearchUrl, parseGoogleNewsFeed, ingestGoogleNewsSource } from "../lib/ingestion/google-news";
import { getSystemUserId } from "../lib/system-actor";

const SAMPLE_XML = readFileSync(path.join(__dirname, "fixtures/google-news-sample.xml"), "utf8");

const createdCategoryIds: string[] = [];
const createdKeywordIds: string[] = [];
const createdSourceIds: string[] = [];

afterAll(async () => {
  if (createdSourceIds.length) await prisma.source.deleteMany({ where: { id: { in: createdSourceIds } } });
  if (createdKeywordIds.length) await prisma.keyword.deleteMany({ where: { id: { in: createdKeywordIds } } });
  if (createdCategoryIds.length) await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
});

describe("buildGoogleNewsQuery", () => {
  it("returns null when the category has no TOPIC-type keywords scoped to it yet", async () => {
    const category = await prisma.category.create({
      data: { name: `GN Test Empty Category ${Date.now()}`, slug: `gn-test-empty-category-${Date.now()}` },
    });
    createdCategoryIds.push(category.id);

    expect(await buildGoogleNewsQuery(category.id)).toBeNull();
  });

  it("OR-joins quoted terms from the category's active TOPIC keywords, ignoring inactive ones and other categories'", async () => {
    const category = await prisma.category.create({
      data: { name: `GN Test Category ${Date.now()}`, slug: `gn-test-category-${Date.now()}` },
    });
    createdCategoryIds.push(category.id);
    const otherCategory = await prisma.category.create({
      data: { name: `GN Test Other Category ${Date.now()}`, slug: `gn-test-other-category-${Date.now()}` },
    });
    createdCategoryIds.push(otherCategory.id);

    const kw1 = await prisma.keyword.create({
      data: { term: `Anthropic ${Date.now()}`, type: "TOPIC", categoryId: category.id, active: true },
    });
    const kw2 = await prisma.keyword.create({
      data: { term: `Google Gemini ${Date.now()}`, type: "TOPIC", categoryId: category.id, active: true },
    });
    const inactiveKw = await prisma.keyword.create({
      data: { term: `Inactive Term ${Date.now()}`, type: "TOPIC", categoryId: category.id, active: false },
    });
    const otherCategoryKw = await prisma.keyword.create({
      data: { term: `Other Category Term ${Date.now()}`, type: "TOPIC", categoryId: otherCategory.id, active: true },
    });
    // A PAKISTAN-type keyword with the same categoryId must never leak into
    // a Google News query — only TOPIC-type keywords are query-scoped.
    const wrongTypeKw = await prisma.keyword.create({
      data: { term: `Pakistan Type Term ${Date.now()}`, type: "PAKISTAN", categoryId: category.id, active: true },
    });
    createdKeywordIds.push(kw1.id, kw2.id, inactiveKw.id, otherCategoryKw.id, wrongTypeKw.id);

    const query = await buildGoogleNewsQuery(category.id);
    expect(query).not.toBeNull();
    expect(query).toContain(`"${kw1.term}"`);
    expect(query).toContain(`"${kw2.term}"`);
    expect(query).toContain(" OR ");
    expect(query).not.toContain(inactiveKw.term);
    expect(query).not.toContain(otherCategoryKw.term);
    expect(query).not.toContain(wrongTypeKw.term);
  });
});

describe("buildGoogleNewsSearchUrl", () => {
  it("builds the expected URL shape with Pakistan-first defaults", () => {
    const url = buildGoogleNewsSearchUrl('"OpenAI" OR "Anthropic"');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://news.google.com/rss/search");
    expect(parsed.searchParams.get("q")).toBe('"OpenAI" OR "Anthropic"');
    expect(parsed.searchParams.get("hl")).toBe("en-PK");
    expect(parsed.searchParams.get("gl")).toBe("PK");
    expect(parsed.searchParams.get("ceid")).toBe("PK:en");
  });

  it("respects an explicit lang/country override", () => {
    const url = buildGoogleNewsSearchUrl("test query", { lang: "en-US", country: "US" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("hl")).toBe("en-US");
    expect(parsed.searchParams.get("gl")).toBe("US");
    expect(parsed.searchParams.get("ceid")).toBe("US:en");
  });
});

describe("parseGoogleNewsFeed", () => {
  it("parses a real captured Google News RSS sample into normalized items with publisher attribution", () => {
    const items = parseGoogleNewsFeed(SAMPLE_XML);
    expect(items).toHaveLength(2);

    expect(items[0].title).toContain("Frontier AI at a cost");
    expect(items[0].link).toBe(
      "https://news.google.com/rss/articles/CBMiugFBVV95cUxPeGc3TXdfdXdxMTB1N2ZzWE42TzZKNFMyeUttSktKXzI0SWQzUHNWQWwzRmxnejlOUHZGdEpfcHR1MzhHNTJ2YXJCd3NxQ2RLbFJKcXZJQ0RER3RTTkxpWFRzcWpGOHpDQ1BUYVhWUFp1MlhfVERKTklUSFFHOXdueTNCVGFTaFhfTXdQOXNfZWhZZW1lZjN2aUljdVAyQzhxR0xmTWF6UC1IYmdlcjJzREVmcmdDZV9MZ0E?oc=5",
    );
    expect(items[0].publishedAt).toEqual(new Date("Wed, 02 Sep 2026 11:30:06 GMT"));
    expect(items[0].sourcePublisherName).toBe("South China Morning Post");
    expect(items[0].sourcePublisherUrl).toBe("https://www.scmp.com");

    expect(items[1].title).toContain("Rethinking cybersecurity operations");
    expect(items[1].sourcePublisherName).toBe("Dawn");
    expect(items[1].sourcePublisherUrl).toBe("https://www.dawn.com");
  });

  it("falls back to unenriched items (still usable) for malformed XML rather than throwing", () => {
    expect(() => parseGoogleNewsFeed("<not valid xml")).not.toThrow();
    expect(parseGoogleNewsFeed("<not valid xml")).toEqual([]);
  });

  it("returns an empty array for a well-formed feed with zero items", () => {
    const emptyFeed = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    expect(parseGoogleNewsFeed(emptyFeed)).toEqual([]);
  });
});

describe("ingestGoogleNewsSource — deterministic edge cases (no real network call)", () => {
  it("returns a clear error result for a source that doesn't exist", async () => {
    const systemUserId = await getSystemUserId();
    const result = await ingestGoogleNewsSource("nonexistent-source-id", systemUserId);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Source not found.");
  });

  it("returns a clear error result for an inactive source", async () => {
    const systemUserId = await getSystemUserId();
    const source = await prisma.source.create({
      data: { name: `GN Inactive Source ${Date.now()}`, url: "https://news.google.com", type: "GOOGLE_NEWS", active: false },
    });
    createdSourceIds.push(source.id);

    const result = await ingestGoogleNewsSource(source.id, systemUserId);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Source is disabled.");
  });

  it("returns a clear error result for a source with no category assigned", async () => {
    const systemUserId = await getSystemUserId();
    const source = await prisma.source.create({
      data: { name: `GN No-Category Source ${Date.now()}`, url: "https://news.google.com", type: "GOOGLE_NEWS", active: true },
    });
    createdSourceIds.push(source.id);

    const result = await ingestGoogleNewsSource(source.id, systemUserId);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Google News source has no category assigned.");
  });

  it("returns a clear error result when the assigned category has no TOPIC keywords yet", async () => {
    const systemUserId = await getSystemUserId();
    const category = await prisma.category.create({
      data: { name: `GN Ingest Test Category ${Date.now()}`, slug: `gn-ingest-test-category-${Date.now()}` },
    });
    createdCategoryIds.push(category.id);
    const source = await prisma.source.create({
      data: { name: `GN No-Keywords Source ${Date.now()}`, url: "https://news.google.com", type: "GOOGLE_NEWS", active: true, categoryId: category.id },
    });
    createdSourceIds.push(source.id);

    const result = await ingestGoogleNewsSource(source.id, systemUserId);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("No query-scoped keywords configured.");

    const updated = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(updated.lastError).toContain("No active TOPIC-type keywords");
  });
});
