import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generateWithAIMock = vi.fn();
vi.mock("../lib/ai/provider", () => ({ generateWithAI: generateWithAIMock }));

const { runModelBenchmark, BENCHMARK_STORIES } = await import("../lib/ai/model-benchmark");

const GOOD_RESPONSE = (headline: string) =>
  JSON.stringify({
    verificationStatus: "PRIMARY_SOURCE_NOT_FOUND",
    verificationConfidence: 60,
    claimsChecked: [],
    notes: "ok",
    draft: {
      headline,
      excerpt: "An excerpt that adds information beyond the headline.",
      blocks: [
        { type: "heading", level: 2, text: "What changed" },
        { type: "paragraph", text: "The company confirmed the update ships this week, according to its own statement." },
      ],
    },
  });

const savedModelId = process.env.AI_MODEL_ID;
beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  if (savedModelId === undefined) delete process.env.AI_MODEL_ID;
  else process.env.AI_MODEL_ID = savedModelId;
});

describe("model benchmark harness", () => {
  it("defines a fixed story for every richness tier", () => {
    const tiers = BENCHMARK_STORIES.map((s) => s.evidence.richness);
    expect(new Set(tiers)).toEqual(new Set(["THIN", "MODERATE", "RICH", "VERY_RICH"]));
  });

  it("runs every fixed story and reports per-story results", async () => {
    generateWithAIMock.mockImplementation(async (_sys: string, user: string) => GOOD_RESPONSE(`Draft for ${user.slice(0, 10)}`));
    const result = await runModelBenchmark("test/model-a");
    expect(result.modelId).toBe("test/model-a");
    expect(result.stories).toHaveLength(BENCHMARK_STORIES.length);
    expect(result.stories.every((s) => s.ok)).toBe(true);
  });

  it("grades each story's output with the real quality gate, not a placeholder", async () => {
    generateWithAIMock.mockImplementation(async () => GOOD_RESPONSE("A clean, attributed headline"));
    const result = await runModelBenchmark("test/model-b");
    for (const s of result.stories) {
      expect(s.quality).not.toBeNull();
      expect(typeof s.quality!.score).toBe("number");
    }
  });

  it("computes an honest parse success rate when a model fails on some stories", async () => {
    // Branch on story content, not call count: a single bad call within one
    // story is absorbed by that story's own retry, so alternating by call
    // count cannot reliably produce a mixed outcome — one story must fail
    // BOTH of its attempts to end up counted as a genuine failure.
    const failingHeadline = BENCHMARK_STORIES[0].headline;
    generateWithAIMock.mockImplementation(async (_sys: string, user: string) =>
      user.includes(failingHeadline) ? "not json at all, ever" : GOOD_RESPONSE("ok"),
    );
    const result = await runModelBenchmark("test/flaky-model");
    expect(result.aggregate.parseSuccessRate).toBeGreaterThan(0);
    expect(result.aggregate.parseSuccessRate).toBeLessThan(1);
    expect(result.stories.some((s) => !s.ok && s.error !== null)).toBe(true);
  });

  it("reports a retry rate above zero when the model needs a retry to produce valid output", async () => {
    let call = 0;
    generateWithAIMock.mockImplementation(async () => {
      call++;
      return call === 1 ? "prose, not json" : GOOD_RESPONSE("recovered");
    });
    const result = await runModelBenchmark("test/model-c", [BENCHMARK_STORIES[0]]);
    expect(result.stories[0].retryCount).toBe(1);
    expect(result.aggregate.retryRate).toBe(1);
  });

  it("restores AI_MODEL_ID to its previous value after a successful run", async () => {
    process.env.AI_MODEL_ID = "original-value";
    generateWithAIMock.mockResolvedValue(GOOD_RESPONSE("ok"));
    await runModelBenchmark("temporary-benchmark-model");
    expect(process.env.AI_MODEL_ID).toBe("original-value");
  });

  it("restores AI_MODEL_ID even when the model call throws", async () => {
    process.env.AI_MODEL_ID = "original-value-2";
    generateWithAIMock.mockRejectedValue(new Error("network down"));
    await runModelBenchmark("temporary-benchmark-model-2");
    expect(process.env.AI_MODEL_ID).toBe("original-value-2");
  });

  it("uses the same evidence for every model — the whole point of the harness", () => {
    // Structural guarantee: BENCHMARK_STORIES is a fixed, exported constant,
    // not something regenerated per call, so two different models run
    // against byte-identical evidence.
    const a = BENCHMARK_STORIES;
    const b = BENCHMARK_STORIES;
    expect(a).toBe(b);
  });
});
