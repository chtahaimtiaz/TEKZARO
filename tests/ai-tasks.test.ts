import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { summarizeClaims } from "../lib/ai/tasks";
import { isAIConfigured } from "../lib/ai/provider";
import { createTestUser, trackUser, cleanupTestData } from "./helpers";

afterAll(cleanupTestData);

// This suite exercises the NOT-CONFIGURED path, so it unconfigures the
// environment explicitly rather than depending on the ambient one. It
// previously just assumed no key was present, which silently became a
// different test the moment a gateway was configured locally.
const GATEWAY_VARS = [
  "OPENROUTER_API_KEY",
  "AI_MODEL_ID",
  "AI_API_KEY",
  "CF_AI_GATEWAY_TOKEN",
  "CF_AI_GATEWAY_ID",
  "CF_AI_GATEWAY_ACCOUNT_ID",
  "R2_ACCOUNT_ID",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of GATEWAY_VARS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of GATEWAY_VARS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("AI task labeling — no gateway configured", () => {
  it("reports AI as not configured when no gateway credentials are present", () => {
    expect(isAIConfigured()).toBe(false);
  });

  it("returns notConfigured:true and logs a FAILED AIGeneration row rather than faking a result", async () => {
    const user = await createTestUser("EDITOR", "ai-not-configured");
    trackUser(user.id);

    const result = await summarizeClaims({
      requestedById: user.id,
      clusterId: "fake-cluster-id",
      sourceTexts: [{ sourceName: "Test Source", text: "Some story text." }],
    });

    expect(result.ok).toBe(false);
    expect(result.notConfigured).toBe(true);
    expect(result.text).toBeUndefined();

    const generation = await prisma.aIGeneration.findUniqueOrThrow({ where: { id: result.generationId } });
    expect(generation.status).toBe("FAILED");
    expect(generation.task).toBe("SUMMARIZE");
    expect(generation.requestedById).toBe(user.id);
    expect(generation.errorMessage).toMatch(/not configured/i);
  });
});
