import "server-only";
import { prisma } from "../prisma";
import type { EvidenceBundle } from "./evidence";
import type { ExtractedClaim } from "./claim-extraction";
import type { QualityGateResult } from "./quality-gate";
import { blockPlainText, type ContentBlock } from "../content-blocks";
import type { Prisma } from "@prisma/client";

/**
 * Writes the three tables that back evidence traceability
 * (EvidenceRecord, ArticleClaim, GenerationMetric) for one generation.
 * Pulled out of lib/verification-actions.ts so that file stays about batch
 * orchestration, not the shape of these inserts.
 *
 * Persisted unconditionally whenever a draft was produced — including one
 * that goes on to fail the quality gate. A rejected draft's evidence is
 * exactly what an editor needs to see to understand the rejection; deleting
 * it on failure would hide the one case this data exists to explain.
 */
export async function persistEvidenceAndClaims(params: {
  generationId: string;
  articleId: string;
  evidence: EvidenceBundle | null;
  claims: ExtractedClaim[];
}): Promise<void> {
  if (!params.evidence || params.evidence.documents.length === 0) return;

  // supportingDocument is compared by reference against the bundle's own
  // documents array, so this map is built from that exact array — matching
  // by url+hostname would be fragile if two documents ever shared a URL.
  const idByDocument = new Map<(typeof params.evidence.documents)[number], string>();

  for (const doc of params.evidence.documents) {
    const created = await prisma.evidenceRecord.create({
      data: {
        generationId: params.generationId,
        articleId: params.articleId,
        url: doc.url,
        hostname: doc.hostname,
        rank: doc.rank,
        rankLabel: doc.rankLabel,
        title: doc.title,
        author: doc.author,
        publishedAt: doc.publishedAt,
        extractedText: doc.text,
        extractionLength: doc.text.length,
        isOriginatingOutlet: doc.isOriginatingOutlet,
        isPrimary: params.evidence.primary === doc,
        isCorroborating: params.evidence.corroborating === doc,
      },
    });
    idByDocument.set(doc, created.id);
  }

  for (const claim of params.claims) {
    await prisma.articleClaim.create({
      data: {
        generationId: params.generationId,
        articleId: params.articleId,
        claimText: claim.claimText.slice(0, 2000),
        claimType: claim.claimType,
        supportingEvidenceId: claim.supportingDocument ? (idByDocument.get(claim.supportingDocument) ?? null) : null,
        sourceExcerpt: claim.sourceExcerpt?.slice(0, 1000) ?? null,
        isDerived: claim.isDerived,
        derivedFromValues: claim.derivedFromValues as unknown as Prisma.InputJsonValue | undefined,
        confidence: claim.confidence,
      },
    });
  }
}

export function countWords(blocks: ContentBlock[]): number {
  return blocks
    .filter((b) => b.type !== "heading")
    .map(blockPlainText)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function countHeadings(blocks: ContentBlock[]): number {
  return blocks.filter((b) => b.type === "heading").length;
}

export async function recordGenerationMetric(params: {
  generationId: string;
  /** Null for a generation with no Discovery origin at all — e.g. an
   * "Improve Article" pass on a manually authored article. */
  sourceItemId: string | null;
  articleId: string | null;
  modelId: string;
  evidence: EvidenceBundle | null;
  blocks: ContentBlock[] | null;
  quality: QualityGateResult | null;
  retryCount: number;
  latencyMs: number;
  sentToReview: boolean;
  autoPublished: boolean;
  rejectionReason: string | null;
  /** What triggered this generation — "batch_cron", "write_with_ai",
   * "improve_article", etc. Defaults to "batch_cron" only because that
   * matches the column's own DB default for pre-existing rows; every new
   * caller should pass its own real value rather than rely on this. */
  triggerType?: string;
  /** Whether the Discovery item's OWN originating page was itself
   * successfully extracted — distinct from the evidence bundle having ANY
   * documents, since those could be entirely from other sources while the
   * item's own page was blocked. Null when no evidence bundle exists at all
   * (nothing was ever attempted). */
  sourceExtractionSuccess?: boolean | null;
  imageOutcome?: string | null;
  imageStatus?: string | null;
  imageFailureReason?: string | null;
  imageLatencyMs?: number | null;
}): Promise<void> {
  const docs = params.evidence?.documents ?? [];
  await prisma.generationMetric.create({
    data: {
      generationId: params.generationId,
      sourceItemId: params.sourceItemId,
      articleId: params.articleId,
      modelId: params.modelId,
      sourceCount: docs.length,
      primarySourceCount: docs.filter((d) => d.rank === 1).length,
      secondarySourceCount: docs.length > 0 ? docs.length - 1 : 0,
      sourceCharCount: params.evidence?.totalChars ?? 0,
      articleWordCount: params.blocks ? countWords(params.blocks) : null,
      headingCount: params.blocks ? countHeadings(params.blocks) : null,
      evidenceRichness: params.evidence?.richness ?? null,
      qualityScore: params.quality?.score ?? null,
      qualityFailures: params.quality ? (params.quality.failures.map((f) => f.code) as unknown as Prisma.InputJsonValue) : undefined,
      sourceConflicts: params.quality && params.quality.conflicts.length > 0 ? (params.quality.conflicts as unknown as Prisma.InputJsonValue) : undefined,
      jsonParseOk: params.rejectionReason === null || !/parsed as valid JSON|schema validation/i.test(params.rejectionReason),
      retryCount: params.retryCount,
      latencyMs: params.latencyMs,
      sentToReview: params.sentToReview,
      autoPublished: params.autoPublished,
      rejectionReason: params.rejectionReason,
      ...(params.triggerType !== undefined ? { triggerType: params.triggerType } : {}),
      sourceExtractionSuccess: params.sourceExtractionSuccess ?? null,
      imageOutcome: params.imageOutcome ?? null,
      imageStatus: params.imageStatus ?? null,
      imageFailureReason: params.imageFailureReason ?? null,
      imageLatencyMs: params.imageLatencyMs ?? null,
    },
  });
}
