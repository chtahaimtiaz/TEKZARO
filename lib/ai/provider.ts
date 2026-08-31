import "server-only";

export class AIProviderNotConfiguredError extends Error {
  constructor() {
    super("AI assistance requires AI_API_KEY to be configured in .env.");
    this.name = "AIProviderNotConfiguredError";
  }
}

export const AI_MODEL = "claude-sonnet-5";

export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

/**
 * Calls Anthropic's Messages API directly via fetch — deliberately not an
 * SDK dependency (same reasoning as skipping NextAuth in Phase 3: don't add
 * an unverified package when a documented HTTP API does the job). Throws
 * AIProviderNotConfiguredError if AI_API_KEY isn't set — callers must
 * handle that and show an honest "not configured" state, never a fake
 * result.
 */
export async function generateWithAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new AIProviderNotConfiguredError();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI provider request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("AI provider returned no text content.");
  return text;
}
