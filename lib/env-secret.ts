/**
 * Reads and sanitizes a secret from process.env before it goes anywhere
 * near an HTTP header. fetch()'s Headers implementation requires every
 * header value to be representable as a ByteString (code points 0-255) —
 * it throws, rather than silently stripping, the moment it sees anything
 * outside that range. A U+FEFF byte-order-mark accidentally prepended to a
 * secret (a routine artifact of pasting a key copied from Notepad, a
 * UTF-8-BOM-saved file, or some clipboard managers on Windows) is exactly
 * such a character, and produces an error ("Cannot convert argument to a
 * ByteString...") that reads nothing like "your API key has an invisible
 * character in it" — confirmed live in production: SEARCH_API_KEY carried
 * a leading BOM, and every Tavily search call failed with that exact
 * message until the stored value was corrected.
 *
 * Every call site in this codebase that interpolates a secret into a
 * header (lib/ai/provider.ts's three gateways, lib/email/provider.ts,
 * lib/search/web-search.ts) reads it through this function instead of
 * `process.env.X` directly, so a future paste-artifact degrades to "treated
 * as if the variable were unset" — an honest, already-handled
 * not-configured state — rather than a cryptic runtime crash deep inside
 * fetch().
 */
// Built from its code point rather than written as a literal character in
// the source: an actual U+FEFF byte sitting in this file would be
// invisible in most editors and in a diff, indistinguishable from the very
// bug this function exists to guard against.
const BOM = String.fromCharCode(0xfeff);

export function readEnvSecret(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  // Strip the BOM wherever it landed — not only a leading position, since
  // some paste paths have been observed inserting it after a prefix rather
  // than only at index 0 — then trim ordinary whitespace, another routine
  // paste artifact.
  const cleaned = raw.split(BOM).join("").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}
