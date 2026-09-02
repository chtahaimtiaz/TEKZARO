import "server-only";

export class AIProviderNotConfiguredError extends Error {
  constructor() {
    super("AI assistance requires AI_API_KEY to be configured in .env.");
    this.name = "AIProviderNotConfiguredError";
  }
}

// Audit-log-friendly label — recorded verbatim on AIGeneration.model (see
// lib/ai/tasks.ts's runTask). Kept separate from GATEWAY_MODEL below so
// that display/audit trail stays a clean, provider-agnostic name even
// though the real request needs the gateway's provider-prefixed form.
export const AI_MODEL = "claude-sonnet-5";

// Vercel AI Gateway's own model identifier convention: "<provider>/<model>".
const GATEWAY_MODEL = "anthropic/claude-sonnet-5";
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

/**
 * Calls Vercel AI Gateway's OpenAI-compatible chat-completions endpoint —
 * a single gateway in front of the actual model provider (Anthropic, via
 * GATEWAY_MODEL's "anthropic/" prefix), rather than Anthropic's API
 * directly. Deliberately not an SDK dependency (same reasoning as skipping
 * NextAuth in Phase 3: don't add an unverified package when a documented
 * HTTP API does the job). Throws AIProviderNotConfiguredError if
 * AI_API_KEY isn't set — callers must handle that and show an honest "not
 * configured" state, never a fake result.
 */
export async function generateWithAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new AIProviderNotConfiguredError();

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GATEWAY_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI provider request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI provider returned no text content.");
  return text;
}
