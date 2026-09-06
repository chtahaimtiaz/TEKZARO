import "server-only";
import { generateWithAI } from "./provider";

/**
 * Gets one JSON object out of the model reliably, or fails cleanly.
 *
 * "AI response could not be parsed as valid JSON" is a reliability problem,
 * not an editorial one, and is handled entirely here — separately from
 * article synthesis, per the brief's own instruction to keep content
 * generation and structured serialization apart. Nothing about the
 * synthesis prompt or the editorial standard changes because of this file.
 *
 * The strongest available mechanism (OpenAI-compatible JSON mode, passed as
 * response_format via generateWithAI's jsonMode option) is requested on
 * every attempt. It is not sufficient on its own: tested directly against
 * OpenRouter's free-tier model, both json_object mode and a strict
 * json_schema were silently ignored — the model returned prose regardless.
 * A model that ignores the mechanism needs a retry with a more forceful
 * instruction, not a stronger claim that the mechanism was used.
 *
 * At most one retry. The retry reuses the exact same system and user
 * prompt — no re-evidence-gathering, no relaxed requirements — with one
 * line appended stating plainly that the previous response was structurally
 * invalid and must not be repeated. If that also fails, this returns
 * ok:false; the caller must treat that exactly like any other "no draft
 * produced" outcome, never accept the malformed text.
 */

export interface StructuredCompletionResult<T> {
  ok: boolean;
  data: T | null;
  raw: string | null;
  retryCount: number;
  error: string | null;
}

const MAX_RETRIES = 1;

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
}

/** Salvages a JSON object embedded in surrounding prose — some models wrap
 * valid JSON in an explanation even when explicitly told not to. Only
 * attempted as a second-chance parse after a direct parse fails; never
 * changes what was actually generated. */
function extractEmbeddedObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export async function generateStructuredCompletion<T>(params: {
  systemPrompt: string;
  userPrompt: string;
  /** Returns the parsed value when the shape is acceptable, or null to
   * reject it (treated the same as a JSON parse failure — a syntactically
   * valid object that fails validation is just as unusable). Kept as a
   * plain predicate rather than a schema library so callers stay in full
   * control of what "valid" means for their own response shape. */
  validate: (value: unknown) => T | null;
}): Promise<StructuredCompletionResult<T>> {
  let lastError = "unknown error";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const userPrompt =
      attempt === 0
        ? params.userPrompt
        : `${params.userPrompt}\n\nYour previous response was not valid JSON and was rejected. Respond again. Output ONLY the JSON object described above — the first character of your response must be "{" and the last must be "}". No markdown code fences, no explanation before or after it.`;

    let text: string;
    try {
      text = await generateWithAI(params.systemPrompt, userPrompt, { jsonMode: true });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    for (const candidate of [stripFences(text), extractEmbeddedObject(text)]) {
      if (!candidate) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        continue;
      }
      const validated = params.validate(parsed);
      if (validated !== null) {
        return { ok: true, data: validated, raw: text, retryCount: attempt, error: null };
      }
    }
    lastError = "AI response could not be parsed as valid JSON or failed schema validation";
  }

  return { ok: false, data: null, raw: null, retryCount: MAX_RETRIES, error: lastError };
}
