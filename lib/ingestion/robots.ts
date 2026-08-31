import { safeFetch } from "../security/safe-fetch";

const USER_AGENT = "TEKZAROBot";
const cache = new Map<string, string[]>(); // origin -> disallow paths for us

function parseDisallowRules(body: string): string[] {
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const disallows: string[] = [];
  let activeForUs = false;
  let activeForAll = false;

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      activeForAll = value === "*";
      activeForUs = value.toLowerCase() === USER_AGENT.toLowerCase();
      continue;
    }
    if (key === "disallow" && (activeForAll || activeForUs) && value) {
      disallows.push(value);
    }
  }
  return disallows;
}

/**
 * Minimal robots.txt Disallow check for `User-agent: *` (and our own UA)
 * rules — fetched via safeFetch (same SSRF protections as feed fetches),
 * cached per-origin for the life of the process/one ingestion run. Fails
 * open (allowed) if robots.txt is missing/unreachable, closed (disallowed)
 * only when a matching Disallow rule is actually found.
 */
export async function isFetchAllowed(targetUrl: string): Promise<boolean> {
  const url = new URL(targetUrl);
  const origin = url.origin;

  let disallows = cache.get(origin);
  if (!disallows) {
    try {
      const res = await safeFetch(`${origin}/robots.txt`);
      disallows = res.status === 200 ? parseDisallowRules(res.text) : [];
    } catch {
      disallows = [];
    }
    cache.set(origin, disallows);
  }

  return !disallows.some((rule) => url.pathname.startsWith(rule));
}

export function clearRobotsCache(): void {
  cache.clear();
}
