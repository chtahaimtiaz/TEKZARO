import { describe, it, expect, vi } from "vitest";

// next/font/google is a build-time transform and throws when imported
// outside Next's pipeline; the layout only needs the CSS variable names.
vi.mock("next/font/google", () => ({
  Fraunces: () => ({ variable: "--font-fraunces" }),
  Inter: () => ({ variable: "--font-inter" }),
}));

const { metadata } = await import("../app/layout");

/**
 * AdSense verifies ownership by finding this tag in <head> on the site.
 * It lives in the root layout's metadata so every route emits it — a tag
 * present on only some pages is the usual reason verification fails.
 */
describe("AdSense site verification", () => {
  it("declares the publisher account in root metadata", () => {
    const other = metadata.other as Record<string, string> | undefined;
    expect(other?.["google-adsense-account"]).toBe("ca-pub-1824611512521520");
  });

  it("keeps the existing metadata intact alongside it", () => {
    // Adding `other` must not have displaced the title template, canonical
    // base or social tags.
    expect(metadata.metadataBase).toBeTruthy();
    expect((metadata.title as { template?: string })?.template).toContain("TEKZARO");
    expect(metadata.openGraph).toBeTruthy();
    expect(metadata.twitter).toBeTruthy();
  });
});
