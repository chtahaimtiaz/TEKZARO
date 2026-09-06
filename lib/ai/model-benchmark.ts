import "server-only";
import { generateStructuredCompletion } from "./structured-completion";
import { runQualityGate, type QualityGateResult } from "./quality-gate";
import { NEWSROOM_SYSTEM_PROMPT } from "./tasks";
import { EDITORIAL_STANDARD } from "./editorial-standard";
import type { EvidenceBundle, EvidenceDocument } from "./evidence";
import { SourceRank } from "./source-classification";

/**
 * Compares models on the SAME evidence and the SAME editorial standard —
 * never on how a model's prose "sounds". Every story below is a fixed
 * EvidenceBundle, not a live search result, so a benchmark run is
 * reproducible and never drifts because a source page changed between
 * runs. Reusable from an admin action, a script, or a test; this module
 * itself performs no persistence — the caller decides where results go.
 */

const RESPONSE_SCHEMA_INSTRUCTIONS = `
Respond with ONLY a single JSON object — no markdown code fences, no commentary before or after. Exact shape:
{
  "verificationStatus": "PRIMARY_SOURCE_CONFIRMED" | "PRIMARY_SOURCE_NOT_FOUND" | "CONTRADICTION_FOUND" | "UNVERIFIED",
  "verificationConfidence": 0-100,
  "claimsChecked": ["specific factual claim you compared against the source(s)", "..."],
  "notes": "plain-English explanation of your reasoning, for a human editor",
  "draft": null | {
    "headline": "specific and accurate, in TEKZARO's own words",
    "excerpt": "1-2 sentences that add information rather than restating the headline",
    "blocks": [ { "type": "paragraph", "text": "..." }, { "type": "heading", "level": 2, "text": "..." }, { "type": "list", "style": "bullet", "items": ["..."] }, { "type": "quote", "text": "...", "cite": "optional" }, { "type": "pakistan-impact", "text": "..." } ]
  }
}
Rules:
- Use "PRIMARY_SOURCE_CONFIRMED" ONLY if a primary source's text was actually provided below AND it corroborates the story.
- Write the draft whenever you have usable material; set "draft" to null only for genuinely unusable input.
- When no primary source was provided, attribute every substantive claim to the outlet that reported it.
`.trim();

function doc(partial: Partial<EvidenceDocument> & Pick<EvidenceDocument, "text" | "hostname" | "rank">): EvidenceDocument {
  return {
    url: `https://${partial.hostname}/story`,
    title: null,
    author: null,
    publishedAt: null,
    isOriginatingOutlet: false,
    rankLabel: "",
    ...partial,
  };
}

function bundle(documents: EvidenceDocument[], richness: EvidenceBundle["richness"]): EvidenceBundle {
  return {
    documents,
    richness,
    totalChars: documents.reduce((n, d) => n + d.text.length, 0),
    primary: documents.find((d) => d.rank === SourceRank.PRIMARY) ?? null,
    corroborating: documents.find((d) => d.rank !== SourceRank.PRIMARY) ?? null,
    notes: [],
  };
}

export interface BenchmarkStory {
  name: string;
  headline: string;
  summary: string;
  reportedBy: string;
  evidence: EvidenceBundle;
}

/** One fixed story per richness tier, each built from realistic, self-
 * contained evidence text — not fetched live, so a benchmark run never
 * varies because a source page changed. */
export const BENCHMARK_STORIES: BenchmarkStory[] = [
  {
    name: "THIN — headline and excerpt only",
    headline: "Startup raises new funding round",
    summary: "A brief wire mention with no further detail.",
    reportedBy: "news.google.com",
    evidence: bundle([], "THIN"),
  },
  {
    name: "MODERATE — one specialist article",
    headline: "Nscale raises $320m Series C for European AI data centres",
    summary: "UK AI compute provider closes a large round.",
    reportedBy: "techcrunch.com",
    evidence: bundle(
      [
        doc({
          hostname: "techcrunch.com",
          rank: SourceRank.SPECIALIST,
          isOriginatingOutlet: true,
          text: "Nscale has raised $320 million in a Series C round led by Sandton Capital, the company told TechCrunch. Chief executive Josh Payne said the funding will expand the firm's GPU cluster capacity across three new European data centres. The round values the company at roughly $2.1 billion, according to two people familiar with the terms; Nscale declined to comment on the valuation. Payne said the company's cost per GPU-hour is meaningfully below US hyperscaler pricing, though he declined to give a figure and no independent benchmark was provided.",
        }),
      ],
      "MODERATE",
    ),
  },
  {
    name: "RICH — primary source plus independent reporting",
    headline: "State Bank reports record Raast transaction volume",
    summary: "Pakistan's instant payment system posts strong quarterly growth.",
    reportedBy: "propakistani.pk",
    evidence: bundle(
      [
        doc({
          hostname: "sbp.org.pk",
          rank: SourceRank.PRIMARY,
          text: "The State Bank of Pakistan said Raast processed 412 million transactions in the quarter ended June 2026, up from 268 million a year earlier. Total value settled reached 9.4 trillion rupees. Average transaction value fell to 22,800 rupees from 31,400 rupees, which the bank attributed to wider adoption for small retail payments. Settlement failures ran at 0.4 percent, down from 1.1 percent.",
        }),
        doc({
          hostname: "propakistani.pk",
          rank: SourceRank.SPECIALIST,
          isOriginatingOutlet: true,
          text: "ProPakistani reports that Raast now connects 34 banks and 8 electronic money institutions, citing the State Bank's own figures. A cross-border pilot with the UAE remains under technical evaluation, with no confirmed timeline.",
        }),
      ],
      "RICH",
    ),
  },
  {
    name: "VERY_RICH — primary plus two independent sources",
    headline: "Chipmaker unveils new memory architecture for AI inference",
    summary: "New part claims a major bandwidth increase over the previous generation.",
    reportedBy: "arstechnica.com",
    evidence: bundle(
      [
        doc({
          hostname: "vendor-newsroom.example",
          rank: SourceRank.PRIMARY,
          text: "The company announced its new accelerator reaches 4.8 terabytes per second of memory bandwidth, roughly double the previous generation, by stacking memory dies directly above the logic die. The company said this shortens signal distance enough to raise clock speed without a matching rise in power draw. Sampling to partners begins in the first quarter; pricing was not disclosed.",
        }),
        doc({
          hostname: "arstechnica.com",
          rank: SourceRank.SPECIALIST,
          isOriginatingOutlet: true,
          text: "Ars Technica's early testing measured 4.6 terabytes per second under sustained load, slightly below the vendor's peak figure, which is typical for peak-vs-sustained comparisons. The publication noted no third party has yet published a full benchmark suite against the previous generation.",
        }),
        doc({
          hostname: "reuters.com",
          rank: SourceRank.MAJOR_INDEPENDENT,
          text: "Reuters reported that two major cloud providers have signed early access agreements for the part, according to people familiar with the matter, though neither company has confirmed the arrangement publicly.",
        }),
      ],
      "VERY_RICH",
    ),
  },
];

export interface StoryBenchmarkResult {
  story: string;
  ok: boolean;
  retryCount: number;
  latencyMs: number;
  wordCount: number;
  headingCount: number;
  quality: QualityGateResult | null;
  error: string | null;
}

export interface ModelBenchmarkResult {
  modelId: string;
  stories: StoryBenchmarkResult[];
  aggregate: {
    parseSuccessRate: number;
    retryRate: number;
    averageLatencyMs: number;
    averageQualityScore: number;
  };
}

interface RawDraft {
  verificationStatus: string;
  draft: { headline: string; excerpt: string; blocks: unknown[] } | null;
}

function validateDraftShape(value: unknown): RawDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.verificationStatus !== "string") return null;
  if (obj.draft === null) return { verificationStatus: obj.verificationStatus, draft: null };
  if (typeof obj.draft !== "object") return null;
  const d = obj.draft as Record<string, unknown>;
  if (typeof d.headline !== "string" || typeof d.excerpt !== "string" || !Array.isArray(d.blocks)) return null;
  return { verificationStatus: obj.verificationStatus, draft: { headline: d.headline, excerpt: d.excerpt, blocks: d.blocks } };
}

function buildUserPrompt(story: BenchmarkStory): string {
  const evidenceText =
    story.evidence.documents.length === 0
      ? "No source material could be retrieved for this story."
      : story.evidence.documents
          .map((d, i) => `SOURCE ${i + 1} (${d.hostname}, rank ${d.rank}):\n${d.text}`)
          .join("\n\n=====\n\n");
  return [
    "Discovered story:",
    `Headline: ${story.headline}`,
    `Summary: ${story.summary}`,
    `Reported by: ${story.reportedBy}`,
    "",
    evidenceText,
    "",
    RESPONSE_SCHEMA_INSTRUCTIONS,
  ].join("\n");
}

/** Runs one model against every fixed story and grades each result with the
 * same quality gate production uses — this is what makes the comparison
 * about measurable editorial performance rather than a subjective read of
 * the prose. Accepts an optional model override purely for testability;
 * production callers pass a real OpenRouter/gateway model slug. */
export async function runModelBenchmark(
  modelId: string,
  stories: BenchmarkStory[] = BENCHMARK_STORIES,
): Promise<ModelBenchmarkResult> {
  const savedModelId = process.env.AI_MODEL_ID;
  process.env.AI_MODEL_ID = modelId;

  const results: StoryBenchmarkResult[] = [];
  try {
    for (const story of stories) {
      const t0 = Date.now();
      const result = await generateStructuredCompletion<RawDraft>({
        systemPrompt: `${NEWSROOM_SYSTEM_PROMPT}\n\n${EDITORIAL_STANDARD}\n\n${RESPONSE_SCHEMA_INSTRUCTIONS}`,
        userPrompt: buildUserPrompt(story),
        validate: validateDraftShape,
      });
      const latencyMs = Date.now() - t0;

      if (!result.ok || !result.data?.draft) {
        results.push({
          story: story.name, ok: false, retryCount: result.retryCount, latencyMs,
          wordCount: 0, headingCount: 0, quality: null, error: result.error,
        });
        continue;
      }

      const blocks = result.data.draft.blocks as Parameters<typeof runQualityGate>[0]["blocks"];
      const quality = runQualityGate({
        headline: result.data.draft.headline,
        excerpt: result.data.draft.excerpt,
        blocks,
        evidence: story.evidence,
      });
      const wordCount = blocks
        .filter((b) => b.type !== "heading")
        .map((b) => ("text" in b ? b.text : "items" in b ? b.items.join(" ") : ""))
        .join(" ")
        .split(/\s+/)
        .filter(Boolean).length;

      results.push({
        story: story.name, ok: true, retryCount: result.retryCount, latencyMs,
        wordCount, headingCount: blocks.filter((b) => b.type === "heading").length,
        quality, error: null,
      });
    }
  } finally {
    if (savedModelId === undefined) delete process.env.AI_MODEL_ID;
    else process.env.AI_MODEL_ID = savedModelId;
  }

  const okResults = results.filter((r) => r.ok);
  return {
    modelId,
    stories: results,
    aggregate: {
      parseSuccessRate: results.length ? okResults.length / results.length : 0,
      retryRate: results.length ? results.filter((r) => r.retryCount > 0).length / results.length : 0,
      averageLatencyMs: results.length ? results.reduce((n, r) => n + r.latencyMs, 0) / results.length : 0,
      averageQualityScore: okResults.length ? okResults.reduce((n, r) => n + (r.quality?.score ?? 0), 0) / okResults.length : 0,
    },
  };
}
