import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { summarizeClaims } from "../lib/ai/tasks";
import { isAIConfigured } from "../lib/ai/provider";
import { createTestUser, trackUser, cleanupTestData } from "./helpers";

afterAll(cleanupTestData);

describe("AI task labeling — not configured (matches this environment's real .env)", () => {
  it("reports AI_API_KEY as not configured, since it genuinely isn't in this environment", () => {
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
