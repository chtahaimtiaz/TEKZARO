import { describe, it, expect } from "vitest";
import { deriveImageStatus } from "../lib/images/status";

describe("image status derivation", () => {
  it("maps a freshly attached image with a publishable licence to IMAGE_LICENSE_VERIFIED", () => {
    expect(deriveImageStatus("ATTACHED", "LICENSED")).toBe("IMAGE_LICENSE_VERIFIED");
    expect(deriveImageStatus("ATTACHED", "ALLOWED")).toBe("IMAGE_LICENSE_VERIFIED");
    expect(deriveImageStatus("ATTACHED", "OWNED")).toBe("IMAGE_LICENSE_VERIFIED");
    expect(deriveImageStatus("ATTACHED", "GENERATED")).toBe("IMAGE_LICENSE_VERIFIED");
  });

  it("maps a deduped hit against an existing publishable Media row the same way as a fresh attach", () => {
    expect(deriveImageStatus("DEDUPED", "LICENSED")).toBe("IMAGE_LICENSE_VERIFIED");
  });

  it("maps an attached image with no explicit licence grant to IMAGE_LICENSE_UNKNOWN, never invented as verified", () => {
    expect(deriveImageStatus("ATTACHED", "REQUIRES_REVIEW")).toBe("IMAGE_LICENSE_UNKNOWN");
    expect(deriveImageStatus("ATTACHED", "UNKNOWN")).toBe("IMAGE_LICENSE_UNKNOWN");
  });

  it("treats an editor's REJECTED decision as a verified (negative) answer, not a pending unknown", () => {
    expect(deriveImageStatus("ATTACHED", "REJECTED")).toBe("IMAGE_LICENSE_VERIFIED");
  });

  it("maps a failed download/store attempt to IMAGE_FETCH_FAILED", () => {
    expect(deriveImageStatus("ALL_CANDIDATES_FAILED", null)).toBe("IMAGE_FETCH_FAILED");
    expect(deriveImageStatus("ERROR", null)).toBe("IMAGE_FETCH_FAILED");
  });

  it("maps a blocked page / no-candidates outcome to IMAGE_NOT_FOUND", () => {
    expect(deriveImageStatus("NO_CANDIDATES", null)).toBe("IMAGE_NOT_FOUND");
    expect(deriveImageStatus("PAGE_BLOCKED_NO_FEED_IMAGE", null)).toBe("IMAGE_NOT_FOUND");
  });

  it("maps no outcome and no reuse status at all to IMAGE_NOT_FOUND rather than throwing", () => {
    expect(deriveImageStatus(null, null)).toBe("IMAGE_NOT_FOUND");
  });

  it("still classifies correctly from reuseStatus alone when outcome is null (a pre-existing Media row, no fresh acquisition attempt)", () => {
    expect(deriveImageStatus(null, "LICENSED")).toBe("IMAGE_LICENSE_VERIFIED");
    expect(deriveImageStatus(null, "REQUIRES_REVIEW")).toBe("IMAGE_LICENSE_UNKNOWN");
  });

  it("never returns IMAGE_LICENSE_VERIFIED without an actual verified reuse status backing it", () => {
    // Guards against the exact failure mode this module exists to prevent:
    // falsely labelling an image as licensed.
    for (const outcome of ["ATTACHED", "DEDUPED"] as const) {
      for (const reuse of ["UNKNOWN", "REQUIRES_REVIEW"] as const) {
        expect(deriveImageStatus(outcome, reuse)).not.toBe("IMAGE_LICENSE_VERIFIED");
      }
    }
  });
});
