import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "../lib/prisma";
import { summarizeClaims } from "../lib/ai/tasks";
import { createTestUser, trackUser, cleanupTestData } from "./helpers";

// vi.mock calls are hoisted above imports by vitest's transform, so the
// static import of lib/ai/tasks above sees this mocked lib/ai/provider
// (which it imports internally) rather than the real one — no real
// network/model call happens.
vi.mock("../lib/ai/provider", () => ({
  isAIConfigured: () => true,
  generateWithAI: async () => "Mocked AI summary output.",
  AI_MODEL: "claude-sonnet-5",
  AIProviderNotConfiguredError: class extends Error {},
}));

afterAll(cleanupTestData);

describe("AI task labeling — configured (mocked provider, no real network/model call)", () => {
  it("logs a COMPLETE AIGeneration row with the model/task/output when the provider succeeds", async () => {
    const user = await createTestUser("EDITOR", "ai-configured");
    trackUser(user.id);

    const result = await summarizeClaims({
      requestedById: user.id,
      clusterId: "fake-cluster-id",
      sourceTexts: [{ sourceName: "Test Source", text: "Some story text." }],
    });

    expect(result.ok).toBe(true);
    expect(result.text).toBe("Mocked AI summary output.");

    const generation = await prisma.aIGeneration.findUniqueOrThrow({ where: { id: result.generationId } });
    expect(generation.status).toBe("COMPLETE");
    expect(generation.model).toBe("claude-sonnet-5");
    expect((generation.output as { text?: string } | null)?.text).toBe("Mocked AI summary output.");
  });
});
