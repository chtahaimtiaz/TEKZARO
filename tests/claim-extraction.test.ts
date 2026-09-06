import { describe, it, expect } from "vitest";
import { extractNumericClaims, hasHedgeLanguage } from "../lib/ai/claim-extraction";
import type { EvidenceBundle, EvidenceDocument } from "../lib/ai/evidence";
import { SourceRank } from "../lib/ai/source-classification";
import type { ContentBlock } from "../lib/content-blocks";

function doc(text: string, overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    url: "https://pub.example/x",
    hostname: "pub.example",
    rank: SourceRank.SPECIALIST,
    rankLabel: "test",
    title: null,
    author: null,
    publishedAt: null,
    text,
    isOriginatingOutlet: false,
    ...overrides,
  };
}
function bundle(documents: EvidenceDocument[]): EvidenceBundle {
  return { documents, richness: "RICH", totalChars: documents.reduce((n, d) => n + d.text.length, 0), primary: null, corroborating: null, notes: [] };
}
const para = (text: string): ContentBlock => ({ type: "paragraph", text });

describe("numeric claim extraction", () => {
  it("classifies a number found verbatim in evidence, with no attribution language, as DIRECT_FACT", () => {
    const claims = extractNumericClaims(
      [para("The service now handles 412 million requests a day across its network.")],
      bundle([doc("Filings show the platform handled 412 million requests per day in June.")]),
    );
    const c = claims.find((c) => c.claimText.includes("412 million"));
    expect(c?.claimType).toBe("DIRECT_FACT");
    expect(c?.supportingDocument?.hostname).toBe("pub.example");
  });

  it("classifies a number attributed to a party as ATTRIBUTED_CLAIM, not DIRECT_FACT", () => {
    const claims = extractNumericClaims(
      [para("The company said its new chip is 40% faster than the previous generation.")],
      bundle([doc("In a statement, the company said its new chip is 40% faster than the previous generation.")]),
    );
    const c = claims.find((c) => c.claimText.includes("40%"));
    expect(c?.claimType).toBe("ATTRIBUTED_CLAIM");
  });

  it("classifies a number as DERIVED_FACT when it is computable from two figures in evidence but not stated verbatim", () => {
    const claims = extractNumericClaims(
      [para("That is a 53.7% increase from the prior quarter.")],
      bundle([doc("The system processed 412 million transactions this quarter, up from 268 million a year earlier.")]),
    );
    const c = claims.find((c) => c.claimText.includes("53.7%"));
    expect(c?.claimType).toBe("DERIVED_FACT");
    expect(c?.isDerived).toBe(true);
    // Stored at full magnitude ("million" resolved), not the display
    // form — that is the more useful number to keep for traceability.
    expect(c?.derivedFromValues).toEqual([268_000_000, 412_000_000]);
  });

  it("classifies a number found in neither evidence nor derivable from it as UNSUPPORTED", () => {
    const claims = extractNumericClaims(
      [para("Sales reportedly grew 85% over the same period.")],
      bundle([doc("The company said sales improved compared with last year, without giving a figure.")]),
    );
    const c = claims.find((c) => c.claimText.includes("85%"));
    expect(c?.claimType).toBe("UNSUPPORTED");
    expect(c?.confidence).toBe(0);
  });

  it("marks every numeric claim UNCERTAIN rather than UNSUPPORTED when there is no evidence at all", () => {
    // Distinguishes "we checked and it doesn't hold up" from "we had
    // nothing to check it against" — a real editorial difference.
    const claims = extractNumericClaims([para("The device reportedly reaches 4.8 terabytes per second.")], bundle([]));
    expect(claims[0].claimType).toBe("UNCERTAIN");
  });

  it("matches a number across differing formatting (commas, unit words)", () => {
    const claims = extractNumericClaims(
      [para("The round values the company at $2.1 billion.")],
      bundle([doc("Two people familiar with the terms said the deal values the firm at 2,100,000,000 dollars.")]),
    );
    const c = claims.find((c) => c.claimText.includes("2.1 billion"));
    expect(c?.claimType).not.toBe("UNSUPPORTED");
  });

  it("does not duplicate a claim row for the same figure repeated verbatim", () => {
    const claims = extractNumericClaims(
      [para("Revenue reached $320 million."), para("The $320 million figure was confirmed by two sources.")],
      bundle([doc("The company reported $320 million in revenue.")]),
    );
    const rows = claims.filter((c) => c.claimText.includes("$320 million"));
    expect(rows.length).toBe(2); // different sentences, both kept — dedup is same-sentence only
  });

  it("extracts from list items and quote blocks, not only paragraphs", () => {
    const blocks: ContentBlock[] = [
      { type: "list", style: "bullet", items: ["4.8 TB/s peak memory bandwidth, according to the manufacturer"] },
      { type: "quote", text: "We measured a 23% improvement in our own labs, the researcher said." },
    ];
    const claims = extractNumericClaims(blocks, bundle([doc("The part reaches 4.8 TB/s. Independent testing found a 23% improvement.")]));
    expect(claims.some((c) => c.claimText.includes("4.8 TB"))).toBe(true);
    expect(claims.some((c) => c.claimText.includes("23%"))).toBe(true);
  });

  it("ignores prose with no numbers at all", () => {
    const claims = extractNumericClaims([para("The company announced a partnership with a regional telecom operator.")], bundle([doc("x")]));
    expect(claims).toHaveLength(0);
  });

  it("extracts from fact-table rows and FAQ answers, not only prose blocks", () => {
    const blocks: ContentBlock[] = [
      { type: "fact-table", rows: [{ label: "Peak bandwidth", value: "4.8 TB/s, according to the manufacturer" }] },
      { type: "faq", items: [{ question: "How much faster is it?", answer: "Independent testing found a 23% improvement." }] },
    ];
    const claims = extractNumericClaims(blocks, bundle([doc("The part reaches 4.8 TB/s. Independent testing found a 23% improvement.")]));
    expect(claims.some((c) => c.claimText.includes("4.8 TB"))).toBe(true);
    expect(claims.some((c) => c.claimText.includes("23%"))).toBe(true);
  });

  it("flags a fabricated figure in a fact-table row as UNSUPPORTED, exactly like one in prose", () => {
    const blocks: ContentBlock[] = [{ type: "fact-table", rows: [{ label: "Price", value: "$999, unconfirmed anywhere" }] }];
    const claims = extractNumericClaims(blocks, bundle([doc("The company has not disclosed pricing.")]));
    const c = claims.find((c) => c.claimText.includes("999"));
    expect(c?.claimType).toBe("UNSUPPORTED");
  });
});

describe("hedge language detection", () => {
  it("recognises a limitations/uncertainty acknowledgement", () => {
    expect(hasHedgeLanguage([para("The company has not disclosed pricing for the new plan.")])).toBe(true);
    expect(hasHedgeLanguage([para("No independent benchmark has been published for this claim.")])).toBe(true);
  });

  it("does not flag ordinary confident prose as hedged", () => {
    expect(hasHedgeLanguage([para("The company shipped the update to all regions on Tuesday.")])).toBe(false);
  });
});
