import type { AcquisitionOutcome } from "./acquire";
import type { ImageReuseStatus } from "@prisma/client";

/**
 * The reader-facing image status vocabulary a CMS operator actually needs —
 * derived from the two things already recorded (the acquisition outcome and
 * the Media row's reuse status), never stored as a third, independently
 * settable value that could drift out of sync with either. There is exactly
 * one source of truth for "what happened" (AcquisitionOutcome) and exactly
 * one for "can this render publicly" (ImageReuseStatus); this is a pure view
 * over both, not new state.
 */
export type ImageStatusLabel =
  | "IMAGE_FOUND"
  | "IMAGE_LICENSE_UNKNOWN"
  | "IMAGE_LICENSE_VERIFIED"
  | "IMAGE_FETCH_FAILED"
  | "IMAGE_NOT_FOUND";

const NOT_FOUND_OUTCOMES: ReadonlySet<AcquisitionOutcome> = new Set(["NO_CANDIDATES", "PAGE_BLOCKED_NO_FEED_IMAGE"]);
const FAILED_OUTCOMES: ReadonlySet<AcquisitionOutcome> = new Set(["ALL_CANDIDATES_FAILED", "ERROR"]);

const VERIFIED_REUSE: ReadonlySet<ImageReuseStatus> = new Set(["ALLOWED", "LICENSED", "OWNED", "GENERATED"]);

export function deriveImageStatus(
  outcome: AcquisitionOutcome | null,
  reuseStatus: ImageReuseStatus | null,
): ImageStatusLabel {
  // An image was actually attached (this run or a prior one, deduped) — its
  // reuse status is what decides whether the licence is settled or still
  // needs a human. REJECTED (an editor already looked and said no) is never
  // "unknown" — it's a verified, negative answer, so it counts as verified
  // rather than pending review.
  if (outcome === "ATTACHED" || outcome === "DEDUPED" || (reuseStatus && !outcome)) {
    if (reuseStatus === "REQUIRES_REVIEW" || reuseStatus === "UNKNOWN") return "IMAGE_LICENSE_UNKNOWN";
    if (reuseStatus && (VERIFIED_REUSE.has(reuseStatus) || reuseStatus === "REJECTED")) return "IMAGE_LICENSE_VERIFIED";
    return "IMAGE_FOUND";
  }
  if (outcome && FAILED_OUTCOMES.has(outcome)) return "IMAGE_FETCH_FAILED";
  if (outcome && NOT_FOUND_OUTCOMES.has(outcome)) return "IMAGE_NOT_FOUND";
  return "IMAGE_NOT_FOUND";
}

export const IMAGE_STATUS_LABELS: Record<ImageStatusLabel, string> = {
  IMAGE_FOUND: "Image found",
  IMAGE_LICENSE_UNKNOWN: "Image found — licence needs review",
  IMAGE_LICENSE_VERIFIED: "Image found — licence cleared",
  IMAGE_FETCH_FAILED: "Image fetch failed",
  IMAGE_NOT_FOUND: "No image available",
};
