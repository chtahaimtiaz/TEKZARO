import { describe, it, expect } from "vitest";
import { classifySource, SourceRank, isPrimaryRank, isCorroboratingRank } from "../lib/ai/source-classification";

const rank = (u: string) => classifySource(u).rank;

describe("source classification", () => {
  it("treats government, regulatory and academic domains as primary", () => {
    // Suffix-based so any ministry or university qualifies without being
    // enumerated — the previous system could only recognise five hostnames.
    for (const u of [
      "https://www.sec.gov/filings/x",
      "https://pta.gov.pk/en/media-center/x",
      "https://www.sbp.org.pk/press/2026/x.htm",
      "https://www.nist.gov/news/x",
      "https://web.mit.edu/news/x",
      "https://www.cam.ac.uk/research/x",
    ]) {
      expect(rank(u), u).toBe(SourceRank.PRIMARY);
    }
  });

  it("treats research and standards publications as primary", () => {
    for (const u of ["https://arxiv.org/abs/2401.00001", "https://www.nature.com/articles/x", "https://www.rfc-editor.org/rfc/rfc9110"]) {
      expect(rank(u), u).toBe(SourceRank.PRIMARY);
    }
  });

  it("recognises a company newsroom, including on a subdomain", () => {
    expect(rank("https://www.apple.com/newsroom/2026/09/x/")).toBe(SourceRank.PRIMARY);
    expect(rank("https://newsroom.apple.com/x")).toBe(SourceRank.PRIMARY);
    expect(rank("https://openai.com/index/x/")).toBe(SourceRank.PRIMARY);
  });

  it("treats a press-release path as first-party even on an unknown domain", () => {
    expect(rank("https://some-unknown-vendor.example/press-release/funding")).toBe(SourceRank.PRIMARY);
  });

  it("ranks wire services above specialist publications", () => {
    expect(rank("https://www.reuters.com/technology/x")).toBe(SourceRank.MAJOR_INDEPENDENT);
    expect(rank("https://techcrunch.com/2026/09/05/x/")).toBe(SourceRank.SPECIALIST);
    expect(rank("https://www.reuters.com/x")).toBeLessThan(rank("https://techcrunch.com/x"));
  });

  it("ranks aggregators below everything, and never mistakes one for the outlet it republishes", () => {
    // Nine of the twenty-four secondary slots used to be news.google.com,
    // which meant an aggregator page counted as independent corroboration.
    expect(rank("https://news.google.com/rss/articles/ABC123")).toBe(SourceRank.AGGREGATOR);
    expect(rank("https://news.yahoo.com/reuters-story-123.html")).toBe(SourceRank.AGGREGATOR);
    expect(isCorroboratingRank(SourceRank.AGGREGATOR)).toBe(false);
  });

  it("matches subdomains without matching lookalike domains", () => {
    expect(rank("https://blog.techcrunch.com/x")).toBe(SourceRank.SPECIALIST);
    expect(rank("https://techcrunch.com.evil.example/x")).toBe(SourceRank.UNKNOWN);
    expect(rank("https://nottechcrunch.com/x")).toBe(SourceRank.UNKNOWN);
  });

  it("ignores a www. prefix", () => {
    expect(rank("https://www.arstechnica.com/x")).toBe(rank("https://arstechnica.com/x"));
  });

  it("only lets primary rank support a confirmation", () => {
    expect(isPrimaryRank(SourceRank.PRIMARY)).toBe(true);
    expect(isPrimaryRank(SourceRank.MAJOR_INDEPENDENT)).toBe(false);
    expect(isPrimaryRank(SourceRank.SPECIALIST)).toBe(false);
  });

  it("degrades safely on a malformed URL instead of throwing", () => {
    expect(rank("not a url")).toBe(SourceRank.UNKNOWN);
    expect(rank("")).toBe(SourceRank.UNKNOWN);
  });
});
