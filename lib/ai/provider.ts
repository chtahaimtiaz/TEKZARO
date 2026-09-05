import "server-only";

export class AIProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "AI assistance is not configured. Set AI_API_KEY (Vercel AI Gateway), or CF_AI_GATEWAY_TOKEN + CF_AI_GATEWAY_ID (+ CF_AI_GATEWAY_ACCOUNT_ID, defaulting to R2_ACCOUNT_ID) for Cloudflare AI Gateway.",
    );
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

/**
 * Which gateway to call, or null when none is configured.
 *
 * Both gateways speak the same OpenAI-compatible chat-completions shape, so
 * only the URL and the auth header differ — the request body and response
 * parsing below are shared. Cloudflare is preferred when fully configured
 * because it is the more explicit choice (three variables, all required);
 * AI_API_KEY alone keeps the original Vercel behaviour untouched.
 *
 * Neither token grants model access by itself. Vercel AI Gateway bills the
 * Vercel account; Cloudflare AI Gateway needs either wholesale credits or a
 * provider key stored in the gateway via Bring Your Own Keys, and returns
 * HTTP 402 "Insufficient wholesale credits" until one of those exists.
 */
function gatewayConfig(): { url: string; headers: Record<string, string>; label: string } | null {
  const cfToken = process.env.CF_AI_GATEWAY_TOKEN;
  // Falls back to the R2 account id: AI Gateway lives in the same Cloudflare
  // account, so requiring it to be re-entered would only invite a mismatch.
  const cfAccount = process.env.CF_AI_GATEWAY_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const cfGateway = process.env.CF_AI_GATEWAY_ID;
  if (cfToken && cfAccount && cfGateway) {
    return {
      url: `https://gateway.ai.cloudflare.com/v1/${cfAccount}/${cfGateway}/compat/chat/completions`,
      headers: { "cf-aig-authorization": `Bearer ${cfToken}` },
      label: "cloudflare",
    };
  }

  const vercelKey = process.env.AI_API_KEY;
  if (vercelKey) {
    return {
      url: "https://ai-gateway.vercel.sh/v1/chat/completions",
      headers: { authorization: `Bearer ${vercelKey}` },
      label: "vercel",
    };
  }

  return null;
}

export function isAIConfigured(): boolean {
  return gatewayConfig() !== null;
}

/** Which gateway a request would use right now — for the admin monitoring
 * panel, so "Configured" can say which provider it actually resolved to
 * rather than leaving an operator to guess. */
export function activeAIGateway(): string | null {
  return gatewayConfig()?.label ?? null;
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
  const gateway = gatewayConfig();
  if (!gateway) throw new AIProviderNotConfiguredError();

  const response = await fetch(gateway.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...gateway.headers,
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
