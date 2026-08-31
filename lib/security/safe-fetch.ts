import { isIP } from "node:net";
import { promises as dns } from "node:dns";
import { isPrivateAddress } from "./ip-guard";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const TIMEOUT_MS = 10_000;

export class UnsafeUrlError extends Error {}
export class ResponseTooLargeError extends Error {}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  text: string;
  finalUrl: string;
}

/**
 * SSRF-hardened fetch for editor/source-supplied URLs (RSS feeds, robots.txt).
 * Protocol allowlist, IP-literal + resolved-DNS private-range rejection,
 * manually-followed and re-validated redirects, request timeout, and a
 * response-size cap. Every external fetch on user/editor-supplied URLs in
 * this codebase goes through this function — nothing else calls fetch()
 * directly on such a URL.
 *
 * Residual risk: DNS-rebinding between the pre-flight resolve and the actual
 * connection (TOCTOU) is not fully closed — doing so would require pinning
 * the resolved IP at the socket layer, which plain fetch()/undici doesn't
 * expose without a custom dispatcher. Noted here rather than claimed away.
 */
export async function safeFetch(inputUrl: string, redirectsLeft = MAX_REDIRECTS): Promise<SafeFetchResult> {
  const url = parseAndValidate(inputUrl);
  await assertResolvesToPublicAddress(url.hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "TEKZAROBot/1.0 (+https://tekzaro.example/about)" },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new UnsafeUrlError("Redirect with no Location header.");
    if (redirectsLeft <= 0) throw new UnsafeUrlError("Too many redirects.");
    const nextUrl = new URL(location, url).toString();
    return safeFetch(nextUrl, redirectsLeft - 1);
  }

  const text = await readCapped(response);
  return { status: response.status, headers: response.headers, text, finalUrl: url.toString() };
}

function parseAndValidate(inputUrl: string): URL {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${inputUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Unsupported protocol: ${url.protocol}`);
  }
  const ipVersion = isIP(url.hostname);
  if (ipVersion && isPrivateAddress(url.hostname)) {
    throw new UnsafeUrlError(`Refusing to fetch a private/reserved address: ${url.hostname}`);
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError("Refusing to fetch localhost.");
  }
  return url;
}

async function assertResolvesToPublicAddress(hostname: string): Promise<void> {
  if (isIP(hostname)) return; // already checked in parseAndValidate
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve host: ${hostname}`);
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`No addresses resolved for host: ${hostname}`);
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new UnsafeUrlError(`Host ${hostname} resolves to a private/reserved address.`);
    }
  }
}

async function readCapped(response: Response): Promise<string> {
  const buffer = await readCappedBinary(response);
  return buffer.toString("utf-8");
}

async function readCappedBinary(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new ResponseTooLargeError(`Response exceeded ${MAX_RESPONSE_BYTES} bytes.`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export interface SafeFetchBinaryResult {
  status: number;
  headers: Headers;
  bytes: Buffer;
  finalUrl: string;
}

/**
 * Binary-safe sibling of `safeFetch` — same SSRF hardening (reuses
 * `parseAndValidate`/`assertResolvesToPublicAddress` verbatim, not a copy),
 * same protocol allowlist, same manually-revalidated redirects, same 10s
 * timeout, same 5MB cap — but returns the raw downloaded bytes instead of
 * decoding them as UTF-8 text, which would corrupt binary content (images).
 * Added for lib/images/acquire.ts; `safeFetch` itself is untouched.
 */
export async function safeFetchBinary(inputUrl: string, redirectsLeft = MAX_REDIRECTS): Promise<SafeFetchBinaryResult> {
  const url = parseAndValidate(inputUrl);
  await assertResolvesToPublicAddress(url.hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "TEKZAROBot/1.0 (+https://tekzaro.example/about)" },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new UnsafeUrlError("Redirect with no Location header.");
    if (redirectsLeft <= 0) throw new UnsafeUrlError("Too many redirects.");
    const nextUrl = new URL(location, url).toString();
    return safeFetchBinary(nextUrl, redirectsLeft - 1);
  }

  const bytes = await readCappedBinary(response);
  return { status: response.status, headers: response.headers, bytes, finalUrl: url.toString() };
}
