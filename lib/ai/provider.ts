import "server-only";
import { SITE_NAME, siteUrl } from "../constants";

export class AIProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "AI assistance is not configured. Set one of: OPENROUTER_API_KEY (OpenRouter), CF_AI_GATEWAY_TOKEN + CF_AI_GATEWAY_ID (Cloudflare AI Gateway), or AI_API_KEY (Vercel AI Gateway).",
    );
    this.name = "AIProviderNotConfiguredError";
  }
}

/**
 * The model slug sent to the gateway, and the label recorded on
 * AIGeneration.model for audit.
 *
 * Configurable because the three supported gateways are all
 * OpenAI-compatible routers that address models by slug, and the useful
 * slug differs by situation: "anthropic/claude-sonnet-5" is the intended
 * production model, but a zero-cost slug (e.g. "minimax/minimax-m3:free"
 * on OpenRouter) lets the whole pipeline be exercised end to end before any
 * billing is set up. Changing it is one environment variable, not a deploy.
 */
export function aiModelId(): string {
  return process.env.AI_MODEL_ID || "anthropic/claude-sonnet-5";
}

/** Audit-log label — recorded verbatim on AIGeneration.model (see
 * lib/ai/tasks.ts's runTask) so the audit trail always names the model that
 * actually ran, including when a non-default one is configured. */
export const AI_MODEL = aiModelId();


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
  // OpenRouter first: unlike the other two it is a model provider in its own
  // right — the key both authenticates and pays — so when one is present it
  // is unambiguously the intended route. The others are proxies that still
  // need funding behind them.
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        authorization: `Bearer ${openRouterKey}`,
        // OpenRouter attributes traffic by these; both optional, and neither
        // carries anything secret.
        "http-referer": siteUrl(),
        "x-title": SITE_NAME,
      },
      label: "openrouter",
    };
  }

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
 * the model slug's "anthropic/" prefix), rather than Anthropic's API
 * directly. Deliberately not an SDK dependency (same reasoning as skipping
 * NextAuth in Phase 3: don't add an unverified package when a documented
 * HTTP API does the job). Throws AIProviderNotConfiguredError if
 * AI_API_KEY isn't set — callers must handle that and show an honest "not
 * configured" state, never a fake result.
 */
export async function generateWithAI(
  systemPrompt: string,
  userPrompt: string,
  options?: { jsonMode?: boolean },
): Promise<string> {
  const gateway = gatewayConfig();
  if (!gateway) throw new AIProviderNotConfiguredError();

  const response = await fetch(gateway.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...gateway.headers,
    },
    body: JSON.stringify({
      model: aiModelId(),
      // A 700-1,200 word article plus its JSON scaffolding (claims, notes,
      // block structure) does not fit in 1024 tokens — that ceiling capped
      // drafts near 200 words regardless of what the prompt asked for.
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // OpenAI-compatible JSON mode. Requested whenever the caller expects
      // structured output — harmless to include even against a model that
      // ignores it (verified: OpenRouter's free tier accepts the field and
      // still returns prose, exactly as it would with the field omitted),
      // and it is honored by models that do support it (Claude via the
      // Vercel/Cloudflare gateways, and paid OpenRouter models with
      // structured_outputs). See lib/ai/structured-completion.ts for the
      // retry that handles the case where a model ignores this anyway.
      ...(options?.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
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
