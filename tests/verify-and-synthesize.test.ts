import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

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

describe("verifyAndSynthesize — configured, no TIER_1 domain match", () => {
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

    expect(safeFetchMock).not.toHaveBeenCalled();
    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_NOT_FOUND");
    expect(result.primarySourceUrl).toBeNull();
    // A draft can still be produced for human review even without a
    // confirmed primary source — only the *status* is overridden.
    expect(result.draft).not.toBeNull();
  });

  it("excludes a candidate on the discovered item's own source domain, even if that domain is TIER_1", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    await makeTier1Source("https://self-outlet.test");
    searchWebMock.mockResolvedValue([{ title: "Self report", url: "https://self-outlet.test/story", snippet: "..." }]);
    generateWithAIMock.mockResolvedValue(
      JSON.stringify({ verificationStatus: "UNVERIFIED", notes: "No independent primary source.", draft: null }),
    );

    const user = await createTestUser("EDITOR", "vs-selfmatch");
    trackUser(user.id);
    const { source, item } = await makeSourceAndItem("https://self-outlet.test");

    const result = await verifyAndSynthesize({ requestedById: user.id, item: { ...item, source } });

    expect(safeFetchMock).not.toHaveBeenCalled();
    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_NOT_FOUND");
  });
});

describe("verifyAndSynthesize — configured, TIER_1 domain match found", () => {
  it("fetches the matched primary source and reflects the model's confirmation", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    await makeTier1Source("https://official-newsroom.test");
    searchWebMock.mockResolvedValue([
      { title: "Official statement", url: "https://official-newsroom.test/press-release", snippet: "..." },
    ]);
    safeFetchMock.mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: "Official statement text confirming the story.",
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
    await makeTier2Source("https://reputable-tech-media.test");
    searchWebMock.mockResolvedValue([
      { title: "Official statement", url: "https://official-newsroom.test/press-release", snippet: "..." },
      { title: "Independent report", url: "https://reputable-tech-media.test/story", snippet: "..." },
    ]);
    safeFetchMock.mockImplementation(async (url: string) => ({
      status: 200,
      headers: new Headers(),
      text: `Text fetched from ${url}`,
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
    expect(safeFetchMock).toHaveBeenCalledWith("https://reputable-tech-media.test/story");
    expect(result.verificationStatus).toBe("PRIMARY_SOURCE_CONFIRMED");
    expect(result.secondarySourceUrl).toBe("https://reputable-tech-media.test/story");
    expect(result.verificationConfidence).toBe(88);
    expect(result.claimsChecked).toEqual(["The company announced the product.", "It ships next month."]);
  });

  it("does not let a secondary source unlock PRIMARY_SOURCE_CONFIRMED on its own — primary is still required", async () => {
    isSearchConfiguredMock.mockReturnValue(true);
    // No TIER_1 source registered at all — only a TIER_2 secondary match exists.
    await makeTier2Source("https://reputable-tech-media.test");
    searchWebMock.mockResolvedValue([
      { title: "Independent report", url: "https://reputable-tech-media.test/story", snippet: "..." },
    ]);
    safeFetchMock.mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: "Independent report text.",
      finalUrl: "https://reputable-tech-media.test/story",
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
    expect(result.secondarySourceUrl).toBe("https://reputable-tech-media.test/story");
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

    const generation = await prisma.aIGeneration.findUniqueOrThrow({ where: { id: result.generationId! } });
    expect(generation.status).toBe("COMPLETE"); // the call itself succeeded; only parsing failed
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
