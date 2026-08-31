import type { ImageCandidate } from "./extract";

// Matched as whole "words" (regex \b), with an optional trailing "s" for
// the common plural directory-segment form (/icons/, /ads/, /logos/) — not
// as bare substrings. A bare substring match on e.g. "ad" would
// false-positive on ordinary filenames like "download.jpg" or
// "canada-flag.png"; \b avoids that (so "/ads/banner.jpg" and
// "banner-ad.png" match, "download.jpg" and "canada-flag.png" don't), and
// the optional "s" still requires its own trailing boundary, so it doesn't
// falsely match inside e.g. "thumbsup-icon.png".
const NEGATIVE_KEYWORDS = ["logo", "avatar", "icon", "pixel", "sprite", "ad", "thumb", "cookie", "placeholder"];
const NEGATIVE_KEYWORD_RE = new RegExp(`\\b(${NEGATIVE_KEYWORDS.join("|")})s?\\b`, "i");

const MIN_DIMENSION = 50;
const MAX_ASPECT_RATIO = 4;
const MIN_ASPECT_RATIO = 0.25;

const METADATA_SOURCE_POINTS: Record<ImageCandidate["metadataSource"], { points: number; reason: string }> = {
  og: { points: 30, reason: "Declared as the page's og:image" },
  jsonld: { points: 25, reason: "Declared in the article's structured data (JSON-LD) as its image" },
  twitter: { points: 20, reason: "Declared as the page's twitter:image" },
  "img-tag": { points: 8, reason: "Appears directly in the article body" },
};

/** Returns a human-readable rejection reason, or null if the candidate
 * survives filtering. These are hard exclusions, not score penalties — a
 * logo or tracking pixel should never become a featured image regardless of
 * how it otherwise scores. */
export function rejectionReason(candidate: ImageCandidate): string | null {
  if (NEGATIVE_KEYWORD_RE.test(candidate.sourceUrl)) {
    const matched = NEGATIVE_KEYWORD_RE.exec(candidate.sourceUrl)?.[1];
    return `URL suggests a non-editorial image (matched "${matched}")`;
  }
  if (candidate.width !== undefined && candidate.width < MIN_DIMENSION) {
    return `Declared width ${candidate.width}px is below the ${MIN_DIMENSION}px minimum`;
  }
  if (candidate.height !== undefined && candidate.height < MIN_DIMENSION) {
    return `Declared height ${candidate.height}px is below the ${MIN_DIMENSION}px minimum`;
  }
  if (candidate.width !== undefined && candidate.height !== undefined) {
    const ratio = candidate.width / candidate.height;
    if (ratio > MAX_ASPECT_RATIO || ratio < MIN_ASPECT_RATIO) {
      return `Aspect ratio ${ratio.toFixed(2)}:1 is too extreme for a featured image`;
    }
  }
  return null;
}

export interface ScoredCandidate {
  score: number;
  reasons: string[];
}

/** Deterministic, additive, auditable score — same {score, reasons} shape as
 * lib/discovery/priority.ts's computePriorityScore. Only ever called on
 * candidates that already passed rejectionReason(). */
export function scoreCandidate(candidate: ImageCandidate): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  const sourcePoints = METADATA_SOURCE_POINTS[candidate.metadataSource];
  score += sourcePoints.points;
  reasons.push(sourcePoints.reason);

  if (candidate.width !== undefined && candidate.height !== undefined) {
    const area = candidate.width * candidate.height;
    if (area >= 1200 * 675) {
      score += 15;
      reasons.push("High resolution (≥1200×675 or equivalent)");
    } else if (area >= 600 * 338) {
      score += 8;
      reasons.push("Adequate resolution");
    }

    const ratio = candidate.width / candidate.height;
    if (ratio >= 1.3 && ratio <= 2.2) {
      score += 10;
      reasons.push("Landscape aspect ratio, suitable as a hero image");
    }
  }

  if (candidate.altText && candidate.altText.trim().length > 4) {
    score += 3;
    reasons.push("Has descriptive alt text");
  }

  return { score: Math.round(score * 10) / 10, reasons };
}

export interface RankedImageCandidate {
  candidate: ImageCandidate;
  score: number;
  reasons: string[];
}

/** Filters out non-editorial candidates (logos, icons, tracking pixels,
 * extreme aspect ratios), scores the survivors, and returns them sorted
 * best-first. lib/images/acquire.ts walks this list in order, trying the
 * next candidate whenever the current best fails to actually download. */
export function rankImageCandidates(candidates: ImageCandidate[]): RankedImageCandidate[] {
  const ranked: RankedImageCandidate[] = [];
  for (const candidate of candidates) {
    if (rejectionReason(candidate)) continue;
    const { score, reasons } = scoreCandidate(candidate);
    ranked.push({ candidate, score, reasons });
  }
  return ranked.sort((a, b) => b.score - a.score);
}
