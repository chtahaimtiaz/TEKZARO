import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";

const isSearchConfiguredMock = vi.fn();
const searchWebMock = vi.fn();
vi.mock("../lib/search/web-search", () => ({
  isSearchConfigured: isSearchConfiguredMock,
  searchWeb: searchWebMock,
  SearchProviderNotConfiguredError: class extends Error {},
}));

const generateWithAIMock = vi.fn();
vi.mock("../lib/ai/provider", () => ({
  isAIConfigured: () => true,
  generateWithAI: generateWithAIMock,
  AI_MODEL: "claude-sonnet-5",
  AIProviderNotConfiguredError: class extends Error {},
}));

const safeFetchMock = vi.fn();
vi.mock("../lib/security/safe-fetch", () => ({
  safeFetch: safeFetchMock,
  UnsafeUrlError: class extends Error {},
  ResponseTooLargeError: class extends Error {},
}));

const { verifyAndSynthesize } = await import("../lib/ai/verify-and-synthesize");
const { prisma } = await import("../lib/prisma");
const { createTestUser, trackUser, cleanupTestData } = await import("./helpers");

const validDraft = {
  headline: "Original synthesized headline",
  excerpt: "A short original excerpt.",
  blocks: [{ type: "paragraph", text: "Original body text, not copied from any source." }],
};

const createdSourceIds: string[] = [];
const createdItemIds: string[] = [];

async function makeSourceAndItem(sourceUrl: string) {
  const source = await prisma.source.create({
    data: { name: `VS Test Source ${Date.now()}-${Math.random()}`, url: sourceUrl, type: "RSS", tier: "TIER_2" },
  });
  createdSourceIds.push(source.id);
  const item = await prisma.sourceItem.create({
    data: {
      sourceId: source.id,
      sourceUrl: `${sourceUrl}/story`,
      headline: "A discovered tech story headline",
      normalizedTitle: "a discovered tech story headline",
      // verifyAndSynthesize() never reads item.status, but "NEW" is a
      // shared, contended queue — tests/verification-actions.test.ts's
      // processVerificationBatch() claims the oldest NEW item across the
      // whole (shared, non-isolated) dev database, and Vitest runs test
      // files concurrently by default. Using a status this file doesn't
      // care about keeps these fixtures out of that other file's way.
      status: "REVIEWING",
    },
  });
  createdItemIds.push(item.id);
  return { source, item };
}

async function makeTier1Source(url: string) {
  const source = await prisma.source.create({
    data: { name: `VS Tier1 Source ${Date.now()}-${Math.random()}`, url, type: "COMPANY_NEWSROOM", tier: "TIER_1" },
  });
  createdSourceIds.push(source.id);
  return source;
}

async function makeTier2Source(url: string) {
  const source = await prisma.source.create({
    data: { name: `VS Tier2 Source ${Date.now()}-${Math.random()}`, url, type: "RSS", tier: "TIER_2" },
  });
  createdSourceIds.push(source.id);
  return source;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  if (createdItemIds.length) await prisma.sourceItem.deleteMany({ where: { id: { in: createdItemIds } } });
  if (createdSourceIds.length) await prisma.source.deleteMany({ where: { id: { in: createdSourceIds } } });
  await cleanupTestData();
});

describe("verifyAndSynthesize — search not configured", () => {
  it("returns UNVERIFIED with no draft and never calls the AI provider", async () => {
    isSearchConfiguredMock.mockReturnValue(false);
    const user = await createTestUser("EDITOR", "vs-notconfigured");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://example-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    expect(result.verificationStatus).toBe("UNVERIFIED");
    expect(result.draft).toBeNull();
    expect(result.generationId).toBeNull();
    expect(generateWithAIMock).not.toHaveBeenCalled();
  });
});

describe("verifyAndSynthesize — configured, no usable primary source", () => {
  it("forces PRIMARY_SOURCE_NOT_FOUND even if the model claims otherwise (deterministic override, no auto-confirm on self-report)", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    searchWebMock.mockResolvedValue([{ title: "Some report", url: "https://random-blog.test/story", snippet: "..." }]);
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({ verificationStatus: "PRIMARY_SOURCE_CONFIRMED", notes: "Looks confirmed to me.", draft: validDraft }),
    );

    const user = await createTestUser("EDITOR", "vs-nomatch");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://example-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    // An unrecognised domain can never be the primary source, however the
    // model self-reports. Fetching still happens: the originating outlet's
    // article is gathered as evidence regardless of what search returned.
    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_NOT_FOUND");
    expect(result.primarySourceUrl).toBeNull();
    // A draft can still be produced for human review even without a
    // confirmed primary source — only the *status* is overridden.
    expect(result.draft).not.toBeNull();
  });

  it("excludes a candidate on the discovered item's own source domain, even if that domain is TIER_1", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    await makeTier1Source("https://self-outlet.test");
    searchWebMock.mockResolvedValue([{ title: "Self report", url: "https://self-outlet.test/press-release", snippet: "..." }]);
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({ verificationStatus: "UNVERIFIED", notes: "No independent primary source.", draft: null }),
    );

    const user = await createTestUser("EDITOR", "vs-selfmatch");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://self-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    // The candidate sits on the item's own domain, so it cannot corroborate
    // the item — an outlet is never its own independent primary source, even
    // when the URL would otherwise classify as a first-party announcement.
    expect(result.primarySourceUrl).toBeNull();
    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_NOT_FOUND");
  });
});

describe("verifyAndSynthesize — configured, primary source available", () => {
  it("fetches the matched primary source and reflects the model's confirmation", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    await makeTier1Source("https://official-newsroom.test");
    searchWebMock.mockResolvedValue([
      { title: "Official statement", url: "https://official-newsroom.test/press-release", snippet: "..." },
    ]);
    safeFetchMock.mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: "Official statement text confirming the story. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. ",
      finalUrl: "https://official-newsroom.test/press-release",
    });
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({
        verificationStatus: "PRIMARY_SOURCE_CONFIRMED",
        notes: "Confirmed by the official newsroom statement.",
        draft: validDraft,
      }),
    );

    const user = await createTestUser("EDITOR", "vs-match");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://example-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    expect(safeFetchMock).toHaveBeenCalledWith("https://official-newsroom.test/press-release");
    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_CONFIRMED");
    expect(result.primarySourceUrl).toBe("https://official-newsroom.test/press-release");
    expect(result.draft?.headline).toBe(validDraft.headline);
  });

  it("also finds and fetches a TIER_2 secondary source, and passes verificationConfidence/claimsChecked through from the model", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    await makeTier1Source("https://official-newsroom.test");
    await makeTier2Source("https://techcrunch.com");
    searchWebMock.mockResolvedValue([
      { title: "Official statement", url: "https://official-newsroom.test/press-release", snippet: "..." },
      { title: "Independent report", url: "https://techcrunch.com/2026/09/05/independent-report/", snippet: "..." },
    ]);
    safeFetchMock.mockImplementation(async (url: string) => ({
      status: 200,
      headers: new Headers(),
      text: `Text fetched from ${url}. ` + "The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. ".repeat(7),
      finalUrl: url,
    }));
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({
        verificationStatus: "PRIMARY_SOURCE_CONFIRMED",
        verificationConfidence: 88,
        claimsChecked: ["The company announced the product.", "It ships next month."],
        notes: "Confirmed by the primary source and corroborated by an independent outlet.",
        draft: validDraft,
      }),
    );

    const user = await createTestUser("EDITOR", "vs-secondary");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://example-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    expect(safeFetchMock).toHaveBeenCalledWith("https://official-newsroom.test/press-release");
    expect(safeFetchMock).toHaveBeenCalledWith("https://techcrunch.com/2026/09/05/independent-report/");
    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_CONFIRMED");
    expect(result.secondarySourceUrl).toBe("https://techcrunch.com/2026/09/05/independent-report/");
    expect(result.verificationConfidence).toBe(88);
    expect(result.claimsChecked).toEqual(["The company announced the product.", "It ships next month."]);
  });

  it("does not let a secondary source unlock PRIMARY_SOURCE_CONFIRMED on its own — primary is still required", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    // No TIER_1 source registered at all — only a TIER_2 secondary match exists.
    await makeTier2Source("https://techcrunch.com");
    searchWebMock.mockResolvedValue([
      { title: "Independent report", url: "https://techcrunch.com/2026/09/05/independent-report/", snippet: "..." },
    ]);
    safeFetchMock.mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: "Independent report text. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. ",
      finalUrl: "https://techcrunch.com/2026/09/05/independent-report/",
    });
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({
        verificationStatus: "PRIMARY_SOURCE_CONFIRMED", // model over-claiming with only a secondary source
        notes: "Should be overridden — no primary source was ever provided.",
        draft: validDraft,
      }),
    );

    const user = await createTestUser("EDITOR", "vs-secondary-only");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://example-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_NOT_FOUND");
    expect(result.primarySourceUrl).toBeNull();
    expect(result.secondarySourceUrl).toBe("https://techcrunch.com/2026/09/05/independent-report/");
  });

  it("treats an unreachable candidate as not-found rather than trusting a URL it never actually read", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    await makeTier1Source("https://official-newsroom.test");
    searchWebMock.mockResolvedValue([
      { title: "Official statement", url: "https://official-newsroom.test/press-release", snippet: "..." },
    ]);
    safeFetchMock.mockRejectedValue(new Error("timed out"));
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({ verificationStatus: "PRIMARY_SOURCE_CONFIRMED", notes: "Should be ignored.", draft: validDraft }),
    );

    const user = await createTestUser("EDITOR", "vs-unreachable");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://example-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_NOT_FOUND");
    expect(result.primarySourceUrl).toBeNull();
  });
});

describe("verifyAndSynthesize — malformed AI output", () => {
  it("degrades to UNVERIFIED/draft:null without throwing, but still records a generationId", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    searchWebMock.mockResolvedValue([]);
    generateWithAIMock.mockResolvedValue("This is not JSON at all — the model ignored instructions.");

    const user = await createTestUser("EDITOR", "vs-malformed");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://example-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    expect(result.verificationStatus).toBe("UNVERIFIED");
    expect(result.draft).toBeNull();
    expect(result.generationId).not.toBeNull();

    // Correctly FAILED, not COMPLETE: runStructuredTask (lib/ai/tasks.ts)
    // owns retry-and-validate as one unit, so a response that could never
    // be turned into usable output — even after the one allowed retry — is
    // an honestly failed generation, not a successful one that merely
    // produced unusable text. Matches the JSON-reliability requirement that
    // a retry-exhausted generation is marked failed, never silently COMPLETE.
    const generation = await prisma.aIGeneration.findUniqueOrThrow({ where: { id: result.generationId! } });
    expect(generation.status).toBe("FAILED");
    expect(generation.errorMessage).toMatch(/not.*(?:parsed|valid)|invalid/i);
  });

  it("degrades to UNVERIFIED/draft:null when the model's JSON is valid but missing required fields", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    searchWebMock.mockResolvedValue([]);
    generateWithAIMock.mockResolvedValue(JSON.stringify({ notes: "Missing verificationStatus entirely." }));

    const user = await createTestUser("EDITOR", "vs-malformed2");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://example-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    expect(result.verificationStatus).toBe("UNVERIFIED");
    expect(result.draft).toBeNull();
  });
});

describe("secondary-source drafting policy", () => {
  it("still returns a draft when only a secondary source could be read, marked PRIMARY_SOURCE_NOT_FOUND", async () => {
    // The pipeline previously produced nothing at all for these stories: the
    // model was told to null the draft without "enough material", and with
    // only five TIER_1 hostnames in the source list a primary source is
    // rarely found, so almost every item ended as "skipped (no draft)".
    // Such a draft is routed to a human editor and can never auto-publish
    // (see the auto-publish gate test in verification-actions.test.ts), so
    // withholding it removed an editor's option rather than protecting a
    // reader.
    isSearchConfiguredMock.mockReturnValue(true);
    await makeTier2Source("https://techcrunch.com");
    searchWebMock.mockResolvedValue([
      { title: "Independent report", url: "https://techcrunch.com/2026/09/05/independent-report/", snippet: "..." },
    ]);
    safeFetchMock.mockImplementation(async (url: string) => ({
      status: 200,
      headers: new Headers(),
      text:
        `Report fetched from ${url}. ` +
        "The company confirmed the details in a statement issued to reporters, describing the timeline, the parties involved, and the expected impact on customers in the region. ".repeat(7),
      finalUrl: url,
    }));
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({
        verificationStatus: "PRIMARY_SOURCE_NOT_FOUND",
        verificationConfidence: 60,
        claimsChecked: ["The company announced the product."],
        notes: "Only an independent outlet's report was available; attributed throughout.",
        draft: validDraft,
      }),
    );

    const user = await createTestUser("EDITOR", "vs-secondary-draft");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://example-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    expect(result.draft).not.toBeNull();
    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_NOT_FOUND");
    expect(result.secondarySourceUrl).toBe("https://techcrunch.com/2026/09/05/independent-report/");
    expect(result.primarySourceUrl).toBeNull();
  });

  it("tells the model to draft on a secondary source and to attribute every claim", () => {
    // The behaviour above depends on prompt wording that is easy to delete by
    // accident, and its loss would be silent — the pipeline would simply stop
    // producing drafts again, exactly as before.
    const src = readFileSync("lib/ai/verify-and-synthesize.ts", "utf8");
    expect(src).toMatch(/PRIMARY_SOURCE_NOT_FOUND"\. A draft in that state is routed to a human editor/);
    expect(src).toMatch(/MUST attribute every substantive claim to the outlet that reported it/);
    expect(src).toMatch(/MUST NOT introduce any detail, figure, name or date/);
  });
});
