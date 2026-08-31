import { attrValue, scanTags, extractJsonLdBlocks, forEachJsonLdNode } from "./html-utils";

// Deliberately narrow: only unambiguous, well-known open-license URL
// patterns qualify. This is the one place in the acquisition pipeline
// allowed to produce a publishable status from a scraped page, so it errs
// hard toward "when in doubt, don't" — see the Non-negotiable invariant in
// the image-acquisition plan. Do not add speculative or inferred patterns
// here; every entry must be a real, machine-readable open-license grant.
const ALLOWED_LICENSE_PATTERNS = [
  /^https?:\/\/(www\.)?creativecommons\.org\/licenses\//i,
  /^https?:\/\/(www\.)?creativecommons\.org\/publicdomain\//i,
];

function isAllowedLicenseUrl(url: string): boolean {
  return ALLOWED_LICENSE_PATTERNS.some((re) => re.test(url.trim()));
}

export interface ReuseEvaluation {
  status: "LICENSED" | "REQUIRES_REVIEW";
  notes: string;
}

const NO_GRANT_FOUND: ReuseEvaluation = {
  status: "REQUIRES_REVIEW",
  notes:
    "No explicit machine-readable reuse grant found on the source page. Most sources carry none — this is the expected, safe outcome, not a bug. An editor must review and approve this image before it can be published.",
};

/**
 * Conservative rights check: recognizes only an explicit
 * `<link rel="license" href="...">` or JSON-LD `license` field that matches
 * a small allowlist of unambiguous open-license URL patterns. Everything
 * else — which is most real-world news pages — lands in REQUIRES_REVIEW.
 * Never invents or infers a license; never returns anything but LICENSED or
 * REQUIRES_REVIEW (ALLOWED/OWNED/GENERATED are not reachable from scraped
 * third-party content — those are only ever set by a human action).
 */
export function evaluateReuseStatus(html: string): ReuseEvaluation {
  for (const tag of scanTags(html, "link")) {
    const rel = attrValue(tag, "rel");
    if (!rel || !/\blicense\b/i.test(rel)) continue;
    const href = attrValue(tag, "href");
    if (href && isAllowedLicenseUrl(href)) {
      return { status: "LICENSED", notes: `Source page links rel="license" to ${href}` };
    }
  }

  for (const block of extractJsonLdBlocks(html)) {
    let found: string | null = null;
    forEachJsonLdNode(block, (node) => {
      if (found) return;
      const license = node.license;
      const url = typeof license === "string" ? license : null;
      if (url && isAllowedLicenseUrl(url)) found = url;
    });
    if (found) {
      return { status: "LICENSED", notes: `Source page's structured data declares license ${found}` };
    }
  }

  return NO_GRANT_FOUND;
}
