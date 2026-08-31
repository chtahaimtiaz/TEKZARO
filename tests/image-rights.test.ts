import { describe, it, expect } from "vitest";
import { evaluateReuseStatus } from "../lib/images/rights";

describe("evaluateReuseStatus", () => {
  it("defaults to REQUIRES_REVIEW when the page has no reuse grant at all — the expected, safe outcome for most real sources", () => {
    const result = evaluateReuseStatus("<html><head><title>A story</title></head><body>Text.</body></html>");
    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("recognizes an explicit rel=\"license\" link to a Creative Commons license URL", () => {
    const html = `<link rel="license" href="https://creativecommons.org/licenses/by/4.0/">`;
    const result = evaluateReuseStatus(html);
    expect(result.status).toBe("LICENSED");
    expect(result.notes).toContain("https://creativecommons.org/licenses/by/4.0/");
  });

  it("recognizes a Creative Commons publicdomain grant", () => {
    const html = `<link rel="license" href="https://creativecommons.org/publicdomain/zero/1.0/">`;
    expect(evaluateReuseStatus(html).status).toBe("LICENSED");
  });

  it("recognizes multiple rel values on the link tag (e.g. rel=\"license copyright\")", () => {
    const html = `<link rel="license copyright" href="https://creativecommons.org/licenses/by-sa/4.0/">`;
    expect(evaluateReuseStatus(html).status).toBe("LICENSED");
  });

  it("recognizes a JSON-LD license field matching the allowlist", () => {
    const html = `<script type="application/ld+json">{"@type":"NewsArticle","license":"https://creativecommons.org/licenses/by/4.0/"}</script>`;
    expect(evaluateReuseStatus(html).status).toBe("LICENSED");
  });

  it("does NOT invent a license from an arbitrary/unrecognized rel=license URL", () => {
    // A page can link rel="license" to its own house terms-of-service page —
    // that is not an open license grant and must not be auto-trusted.
    const html = `<link rel="license" href="https://news.example.com/terms-of-use">`;
    expect(evaluateReuseStatus(html).status).toBe("REQUIRES_REVIEW");
  });

  it("does NOT invent a license from an unrecognized JSON-LD license URL", () => {
    const html = `<script type="application/ld+json">{"license":"https://news.example.com/copyright"}</script>`;
    expect(evaluateReuseStatus(html).status).toBe("REQUIRES_REVIEW");
  });

  it("does not treat a bare textual mention of 'creative commons' as a grant — only a real machine-readable link/field counts", () => {
    const html = `<p>This photo may be under a creative commons license, check with the author.</p>`;
    expect(evaluateReuseStatus(html).status).toBe("REQUIRES_REVIEW");
  });

  it("never throws on malformed HTML or JSON-LD", () => {
    expect(() => evaluateReuseStatus("<<<broken")).not.toThrow();
    expect(() => evaluateReuseStatus(`<script type="application/ld+json">{not json</script>`)).not.toThrow();
    expect(() => evaluateReuseStatus("")).not.toThrow();
  });
});
