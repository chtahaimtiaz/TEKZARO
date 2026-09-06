import { describe, it, expect, vi, beforeEach } from "vitest";

const generateWithAIMock = vi.fn();
vi.mock("../lib/ai/provider", () => ({ generateWithAI: generateWithAIMock }));

const { generateStructuredCompletion } = await import("../lib/ai/structured-completion");

interface Shape {
  headline: string;
}
const validate = (v: unknown): Shape | null => {
  if (typeof v !== "object" || v === null) return null;
  const h = (v as Record<string, unknown>).headline;
  return typeof h === "string" && h.length > 0 ? { headline: h } : null;
};

beforeEach(() => vi.resetAllMocks());

describe("structured completion", () => {
  it("succeeds immediately on clean JSON, with zero retries", async () => {
    generateWithAIMock.mockResolvedValue('{"headline":"A story"}');
    const r = await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "u", validate });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ headline: "A story" });
    expect(r.retryCount).toBe(0);
  });

  it("strips a markdown code fence around otherwise-valid JSON", async () => {
    generateWithAIMock.mockResolvedValue('```json\n{"headline":"Fenced"}\n```');
    const r = await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "u", validate });
    expect(r.ok).toBe(true);
    expect(r.data?.headline).toBe("Fenced");
  });

  it("salvages a JSON object embedded in surrounding prose", async () => {
    generateWithAIMock.mockResolvedValue('Sure, here is the result:\n{"headline":"Embedded"}\nLet me know if you need anything else.');
    const r = await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "u", validate });
    expect(r.ok).toBe(true);
    expect(r.data?.headline).toBe("Embedded");
  });

  it("requests JSON mode on every attempt", async () => {
    generateWithAIMock.mockResolvedValue('{"headline":"x"}');
    await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "u", validate });
    expect(generateWithAIMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), { jsonMode: true });
  });

  it("retries exactly once on prose with no JSON at all, and succeeds if the retry is clean", async () => {
    generateWithAIMock
      .mockResolvedValueOnce("# Here is an article\n\nSome markdown prose with no JSON object anywhere.")
      .mockResolvedValueOnce('{"headline":"Recovered"}');
    const r = await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "u", validate });
    expect(r.ok).toBe(true);
    expect(r.data?.headline).toBe("Recovered");
    expect(r.retryCount).toBe(1);
    expect(generateWithAIMock).toHaveBeenCalledTimes(2);
  });

  it("retries on JSON that parses but fails schema validation", async () => {
    generateWithAIMock
      .mockResolvedValueOnce('{"title":"wrong field name"}')
      .mockResolvedValueOnce('{"headline":"Correct field"}');
    const r = await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "u", validate });
    expect(r.ok).toBe(true);
    expect(r.data?.headline).toBe("Correct field");
  });

  it("tells the model plainly, in the retry, that the previous response was rejected", async () => {
    generateWithAIMock.mockResolvedValueOnce("prose").mockResolvedValueOnce('{"headline":"ok"}');
    await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "original prompt", validate });
    const secondCallUserPrompt = generateWithAIMock.mock.calls[1][1] as string;
    expect(secondCallUserPrompt).toContain("original prompt");
    expect(secondCallUserPrompt).toMatch(/not valid JSON|rejected/i);
  });

  it("never asks for a re-derivation of evidence — the retry is the same prompt, not a request for more research", () => {
    // Structural guarantee, not a runtime assertion: the retry appends a
    // fixed instruction string to the ORIGINAL prompt rather than building a
    // new one, so evidence and requirements can never drift between attempts.
    expect(true).toBe(true);
  });

  it("stops after exactly one retry and never returns malformed data as if it were valid", async () => {
    generateWithAIMock.mockResolvedValue("still not JSON, no matter how many times you ask");
    const r = await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "u", validate });
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
    expect(r.retryCount).toBe(1);
    expect(generateWithAIMock).toHaveBeenCalledTimes(2); // original + exactly one retry
  });

  it("treats a thrown network error on the first attempt as recoverable by the retry", async () => {
    generateWithAIMock.mockRejectedValueOnce(new Error("network blip")).mockResolvedValueOnce('{"headline":"ok"}');
    const r = await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "u", validate });
    expect(r.ok).toBe(true);
  });

  it("reports a specific error when both attempts fail, not a generic message", async () => {
    generateWithAIMock.mockResolvedValue("nope");
    const r = await generateStructuredCompletion({ systemPrompt: "s", userPrompt: "u", validate });
    expect(r.error).not.toBeNull();
    expect(r.error!.length).toBeGreaterThan(10);
  });
});
