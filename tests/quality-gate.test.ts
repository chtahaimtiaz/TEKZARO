import { describe, it, expect } from "vitest";
import { runQualityGate } from "../lib/ai/quality-gate";
import type { EvidenceBundle, EvidenceDocument } from "../lib/ai/evidence";
import { SourceRank } from "../lib/ai/source-classification";
import type { ContentBlock } from "../lib/content-blocks";

function doc(text: string, overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    url: "https://specialist.example/x", hostname: "specialist.example", rank: SourceRank.SPECIALIST,
    rankLabel: "test", title: null, author: null, publishedAt: null, text, isOriginatingOutlet: false,
    ...overrides,
  };
}
function bundle(documents: EvidenceDocument[], richness: EvidenceBundle["richness"] = "RICH"): EvidenceBundle {
  return { documents, richness, totalChars: documents.reduce((n, d) => n + d.text.length, 0), primary: null, corroborating: null, notes: [] };
}
const para = (text: string): ContentBlock => ({ type: "paragraph", text });
const heading = (text: string): ContentBlock => ({ type: "heading", level: 2, text });

const CLEAN_EVIDENCE =
  "The system processed 412 million transactions this quarter, up from 268 million a year earlier. " +
  "The company said the increase came from wider small-retail adoption. Independent analysts have not audited the figures.";

describe("quality gate — passing article", () => {
  it("passes a well-attributed, well-structured article built from real evidence", () => {
    const blocks: ContentBlock[] = [
      para("Transactions reached 412 million this quarter, up from 268 million a year earlier, according to the company."),
      heading("Why the average ticket size fell"),
      para("The company said the shift reflects wider adoption for small retail payments rather than a decline in larger transfers."),
      heading("What remains unverified"),
      para("Independent analysts have not audited the underlying figures, which come from the company's own reporting."),
    ];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc(CLEAN_EVIDENCE)]) });
    expect(result.passed).toBe(true);
    expect(result.failures.map((f) => f.code)).not.toContain("UNSUPPORTED_CLAIM");
  });
});

describe("quality gate — failure detection", () => {
  it("fails an article containing a figure with no supporting evidence", () => {
    const blocks: ContentBlock[] = [
      heading("Overview"),
      para("Sales reportedly grew 85% over the same period, though no evidence supports this."),
    ];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc("The company said sales improved.")]) });
    expect(result.passed).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain("UNSUPPORTED_CLAIM");
  });

  it("flags a primary-source figure stated as plain fact with no attribution language", () => {
    const blocks: ContentBlock[] = [
      heading("What changed"),
      para("The chip runs at 4.8 terabytes per second. It is a major leap forward for the platform."),
    ];
    const evidence = bundle([doc("The chip runs at 4.8 terabytes per second.", { rank: SourceRank.PRIMARY })]);
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence });
    expect(result.failures.map((f) => f.code)).toContain("MISSING_ATTRIBUTION");
  });

  it("flags generic, non-subject-specific headings", () => {
    const blocks: ContentBlock[] = [
      heading("What Happened"),
      para("The company shipped an update to all regions on Tuesday, according to its release notes."),
      heading("Conclusion"),
      para("That is the end of the story, the company confirmed in its notes."),
    ];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc("The company shipped an update to all regions on Tuesday.")]) });
    expect(result.failures.map((f) => f.code)).toContain("GENERIC_HEADINGS");
  });

  it("flags two sections that restate the same content", () => {
    const repeated = "The company said its new service will roll out to all regions over the coming weeks, starting with North America and Europe before expanding further.";
    const blocks: ContentBlock[] = [heading("Rollout"), para(repeated), heading("What it means"), para(repeated)];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc(repeated)]) });
    expect(result.failures.map((f) => f.code)).toContain("REPETITIVE_CONTENT");
  });

  it("flags a conflict between sources that the article does not acknowledge", () => {
    const blocks: ContentBlock[] = [
      heading("Performance claims"),
      para("The company says the chip is 40% faster than the previous generation."),
    ];
    const evidence = bundle([
      doc("The company says the chip is 40% faster.", { hostname: "vendor.example" }),
      doc("Independent testing found the chip only 23% faster in real workloads.", { hostname: "lab.example" }),
    ]);
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence });
    expect(result.failures.map((f) => f.code)).toContain("SOURCE_CONFLICT");
    expect(result.failures.map((f) => f.code)).toContain("MISSING_LIMITATIONS");
  });

  it("does not demand limitations language on a clean article with nothing to hedge", () => {
    const blocks: ContentBlock[] = [
      heading("What changed"),
      para("The company confirmed the update ships to all regions this week."),
    ];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc("The company confirmed the update ships to all regions this week.")]) });
    expect(result.failures.map((f) => f.code)).not.toContain("MISSING_LIMITATIONS");
  });

  it("flags very rich evidence producing a near-empty article as a synthesis failure", () => {
    const richText = "A".repeat(200) + " " + CLEAN_EVIDENCE.repeat(20);
    const blocks: ContentBlock[] = [heading("Summary"), para("Something happened, according to the company.")];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc(richText), doc(richText, { hostname: "b.example", rank: SourceRank.PRIMARY })], "VERY_RICH") });
    expect(result.failures.map((f) => f.code)).toContain("INSUFFICIENT_CONTEXT");
  });

  it("never flags INSUFFICIENT_CONTEXT for a short article built from thin evidence — brevity earned honestly is not a failure", () => {
    const blocks: ContentBlock[] = [heading("What's known"), para("The company confirmed the update ships this week.")];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc("The company confirmed the update ships this week.")], "THIN") });
    expect(result.failures.map((f) => f.code)).not.toContain("INSUFFICIENT_CONTEXT");
  });

  it("fails an article whose only unsupported figure is buried in a fact-table row", () => {
    // A fabricated number in a table cell is exactly as dangerous as one in
    // a sentence — proseBlocks/extractNumericClaims must reach both.
    const blocks: ContentBlock[] = [
      heading("Specifications"),
      { type: "fact-table", rows: [{ label: "Price", value: "$999, unconfirmed anywhere in the source material" }] },
    ];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc("The company has not disclosed pricing.")]) });
    expect(result.failures.map((f) => f.code)).toContain("UNSUPPORTED_CLAIM");
  });

  it("still flags a generic heading even when it carries inline formatting marks", () => {
    const blocks: ContentBlock[] = [
      { type: "heading", level: 2, text: "**What Happened**" },
      para("The company shipped an update to all regions on Tuesday, according to its release notes."),
    ];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc("The company shipped an update to all regions on Tuesday.")]) });
    expect(result.failures.map((f) => f.code)).toContain("GENERIC_HEADINGS");
  });

  it("passes a well-supported FAQ answer and does not treat it as invisible to the word count", () => {
    const blocks: ContentBlock[] = [
      heading("Frequently asked questions"),
      { type: "faq", items: [{ question: "How much faster is it?", answer: "The company said the chip is 40% faster than the previous generation." }] },
    ];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc("The company said the chip is 40% faster than the previous generation.")]) });
    expect(result.failures.map((f) => f.code)).not.toContain("UNSUPPORTED_CLAIM");
  });
});

describe("quality gate — scoring", () => {
  it("never lets word count alone raise the score — a longer, padded article does not outscore a shorter honest one", () => {
    const shortGood: ContentBlock[] = [
      heading("What changed"),
      para("The company said transactions reached 412 million this quarter, up from 268 million a year earlier."),
    ];
    const longPadded: ContentBlock[] = [
      heading("What Happened"),
      para("Sales reportedly grew 85% this quarter, a huge and unprecedented jump for the industry."),
      heading("Why It Matters"),
      para("This is a massive development that could change everything for the sector going forward."),
      heading("More Details"),
      para("Sales reportedly grew 85% this quarter, a huge and unprecedented jump for the industry."),
    ];
    const evidence = bundle([doc(CLEAN_EVIDENCE)]);
    const good = runQualityGate({ headline: "h", excerpt: "e", blocks: shortGood, evidence });
    const bad = runQualityGate({ headline: "h", excerpt: "e", blocks: longPadded, evidence });
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it("reports every failure with an actionable, specific detail — never a bare 'failed' message", () => {
    const blocks: ContentBlock[] = [para("Sales reportedly grew 85%, with no support for the figure anywhere.")];
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks, evidence: bundle([doc("x")]) });
    for (const f of result.failures) {
      expect(f.detail.length).toBeGreaterThan(15);
      expect(f.detail.toLowerCase()).not.toBe("article failed quality check.");
    }
  });

  it("scores in the 0-100 range", () => {
    const result = runQualityGate({ headline: "h", excerpt: "e", blocks: [para("x")], evidence: bundle([]) });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
