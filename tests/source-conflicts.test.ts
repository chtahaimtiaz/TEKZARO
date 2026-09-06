import { describe, it, expect } from "vitest";
import { detectNumericConflicts } from "../lib/ai/source-conflicts";
import type { EvidenceBundle, EvidenceDocument } from "../lib/ai/evidence";
import { SourceRank } from "../lib/ai/source-classification";

function doc(hostname: string, text: string): EvidenceDocument {
  return {
    url: `https://${hostname}/x`, hostname, rank: SourceRank.SPECIALIST, rankLabel: "test",
    title: null, author: null, publishedAt: null, text, isOriginatingOutlet: false,
  };
}
function bundle(documents: EvidenceDocument[]): EvidenceBundle {
  return { documents, richness: "RICH", totalChars: 0, primary: null, corroborating: null, notes: [] };
}

describe("source conflict detection", () => {
  it("flags the brief's own worked example — 40% faster vs. 23% faster", () => {
    const b = bundle([
      doc("vendor.example", "The company says the new chip is 40% faster than the previous model."),
      doc("independent-lab.example", "Independent testing found the chip only 23% faster in real workloads."),
    ]);
    const conflicts = detectNumericConflicts(b);
    expect(conflicts.some((c) => c.keyword === "faster")).toBe(true);
    const c = conflicts.find((c) => c.keyword === "faster")!;
    expect(c.values.map((v) => v.value).sort((a, b) => a - b)).toEqual([23, 40]);
  });

  it("does not flag agreeing sources as a conflict", () => {
    const b = bundle([
      doc("a.example", "The startup raised a valuation of $2.1 billion."),
      doc("b.example", "Two sources say the deal values the company at $2.1 billion."),
    ]);
    expect(detectNumericConflicts(b)).toHaveLength(0);
  });

  it("does not flag a single source repeating its own figure", () => {
    const b = bundle([doc("a.example", "Revenue grew 40%. That 40% growth figure was the headline result.")]);
    expect(detectNumericConflicts(b)).toHaveLength(0);
  });

  it("does not flag numbers near unrelated keywords as conflicting", () => {
    const b = bundle([
      doc("a.example", "The company has 400 employees and raised its valuation guidance."),
      doc("b.example", "The device offers a battery life of 12 hours, unrelated to headcount."),
    ]);
    expect(detectNumericConflicts(b)).toHaveLength(0);
  });

  it("tolerates minor rounding differences without flagging a conflict", () => {
    const b = bundle([
      doc("a.example", "The valuation is roughly $2.10 billion, according to filings."),
      doc("b.example", "Reports put the valuation at about $2.15 billion."),
    ]);
    expect(detectNumericConflicts(b)).toHaveLength(0);
  });

  it("returns nothing when there is only one document", () => {
    const b = bundle([doc("a.example", "The chip is 40% faster, the company said.")]);
    expect(detectNumericConflicts(b)).toHaveLength(0);
  });
});
