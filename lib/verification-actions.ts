import "server-only";
import { prisma } from "./prisma";
import { getSystemUserId } from "./system-actor";
import { verifyAndSynthesize } from "./ai/verify-and-synthesize";
import { pickEligibleAuthor } from "./author-eligibility";
import { ensureUniqueSlug } from "./slug";
import { featuredImageFieldsWithDiagnostics } from "./images/featured-image";
import { deriveImageStatus } from "./images/status";
import { evaluatePublicationChecks, allChecksPassed } from "./publication-checks";
import { snapshotVersion, buildSnapshotFromArticleRow } from "./article-snapshot";
import { logAction } from "./audit";
import { logSystemEvent } from "./monitoring";
import { runQualityGate } from "./ai/quality-gate";
import { persistEvidenceAndClaims, recordGenerationMetric } from "./ai/generation-persistence";
import { aiModelId } from "./ai/provider";
import type { EvidenceBundle } from "./ai/evidence";
import type { Prisma, Source, Category, SourceItem } from "@prisma/client";

/** Used only when verifyAndSynthesize returns no evidence bundle at all
 * (search unconfigured, or it failed before any fetch was attempted) — the
 * quality gate always wants a concrete bundle, and "nothing was gathered"
 * is exactly what an empty one already means. */
const EMPTY_EVIDENCE: EvidenceBundle = { documents: [], richness: "THIN", totalChars: 0, primary: null, corroborating: null, notes: [] };

/**
 * Home for a SourceItem whose Source carries no categoryId (e.g. a
 * general-interest outlet not yet scoped to any specific category). This
 * used to fall back to whichever Category sorted first alphabetically —
 * "AI" in practice — which silently mislabeled unrelated stories (a
 * toothbrush review, a digital piano) as AI content. A real, dedicated,
 * always-excluded-from-auto-publish category makes that failure visible to
 * an editor instead of invisible inside a real topic. See Stage 6A's
 * Discovery Coverage Diagnostic for the incident this fixes.
 */
export const UNCATEGORIZED_CATEGORY_SLUG = "uncategorized";

/**
 * Kill switch / gradual-rollout control: a category must be explicitly
 * listed in AUTO_PUBLISH_CATEGORY_SLUGS (comma-separated slugs) before this
 * pipeline will ever auto-publish into it. Defaults to empty — meaning
 * nothing auto-publishes anywhere — so a fresh deploy starts in pure
 * "verify + synthesize -> human review" mode, matching the recommended
 * trial period before enabling auto-publish for selected high-confidence
 * categories.
 *
 * UNCATEGORIZED_CATEGORY_SLUG is hard-excluded regardless of env
 * configuration — an item that landed here did so specifically because
 * nothing could confirm what topic it belongs to, so it must always reach a
 * human, even if someone mistakenly adds "uncategorized" to the allowlist
 * string one day.
 */
function isCategoryAllowedForAutoPublish(categorySlug: string): boolean {
  if (categorySlug === UNCATEGORIZED_CATEGORY_SLUG) return false;
  const raw = process.env.AUTO_PUBLISH_CATEGORY_SLUGS ?? "";
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(categorySlug);
}

export interface SingleItemOutcome {
  ok: boolean;
  articleId?: string;
  published?: boolean;
  error?: string;
  /** Machine-readable reason a draft could not even be attempted — distinct
   * from `error`, which is for an unexpected exception. Lets a caller (a
   * server action surfacing this to an editor) show a specific message
   * without string-matching `error`. */
  skipReason?: "no_category" | "no_eligible_author" | "unresolved_contradiction" | "no_draft" | "not_found";
}

/**
 * The full per-item pipeline: category/author resolution, verify+synthesize,
 * the quality gate, evidence/claim persistence, the publish decision, and
 * the GenerationMetric row — shared by processVerificationBatch (looping
 * over many NEW items on a cron schedule) and verifySourceItem (one named
 * item, triggered by an editor's "Write with AI" click). Extracted so the
 * two entry points can never drift into two different auto-publish
 * decisions; every branch below is unchanged from the batch loop this was
 * lifted out of.
 *
 * actorId is who the resulting Article/AuditLog/ArticleVersion rows are
 * attributed to — the SYSTEM actor for the batch cron, the clicking
 * editor's own id for a human-triggered single-item generation. This is
 * the one thing that differs between the two callers; everything else
 * about the decision is identical regardless of who or what triggered it.
 */
async function processOneItem(params: {
  item: SourceItem & { source: Source; category: Category | null };
  fallbackCategory: Category | null;
  actorId: string;
  triggerType: string;
}): Promise<SingleItemOutcome> {
  const { item, fallbackCategory, actorId, triggerType } = params;

  const category = item.category ?? fallbackCategory;
  if (!category) {
    await logSystemEvent({
      level: "WARN",
      source: "verification.batch",
      message: `SourceItem ${item.id} has no category and the "${UNCATEGORIZED_CATEGORY_SLUG}" fallback category doesn't exist — left for a future run.`,
      context: { sourceItemId: item.id },
    });
    return { ok: false, skipReason: "no_category", error: "This item has no category, and the Uncategorized fallback doesn't exist yet." };
  }

  // Checked BEFORE the paid search call in verifyAndSynthesize — no point
  // burning a Tavily credit on an item that can't produce an eligible draft
  // anyway. "No eligible author" must never fall back to *any* author; it's
  // an operator-visible skip, not a silent wrong assignment.
  const eligibleAuthor = await pickEligibleAuthor(category.id);
  if (!eligibleAuthor) {
    await logSystemEvent({
      level: "WARN",
      source: "verification.batch",
      message: `No active author is eligible for category "${category.name}" — SourceItem ${item.id} left for a future run.`,
      context: { sourceItemId: item.id, categoryId: category.id },
    });
    return {
      ok: false,
      skipReason: "no_eligible_author",
      error: `No active author is eligible for the "${category.name}" category. Add eligibility for an author on the Authors page first.`,
    };
  }

  const generationStartedAt = Date.now();
  const result = await verifyAndSynthesize({ requestedById: actorId, item });
  const latencyMs = Date.now() - generationStartedAt;

  if (!result.draft) {
    // Recorded even on failure — a story with no draft still measured how
    // much evidence was available (often none), whether the AI call's JSON
    // ever parsed, and how long it took. Without this row the failure case
    // is invisible to the metrics the dashboard needs to answer "why did
    // stories fail" and "which sources produce strong evidence".
    if (result.generationId) {
      await recordGenerationMetric({
        generationId: result.generationId,
        sourceItemId: item.id,
        articleId: null,
        modelId: aiModelId(),
        evidence: result.evidence,
        blocks: null,
        quality: null,
        retryCount: result.retryCount,
        latencyMs,
        sentToReview: false,
        autoPublished: false,
        rejectionReason: result.notes,
        triggerType,
        sourceExtractionSuccess: result.evidence?.documents.some((d) => d.isOriginatingOutlet) ?? null,
      }).catch(() => {
        // Metrics must never break the caller — same posture as
        // logSystemEvent throughout this file.
      });
    }
    // Log why. verifyAndSynthesize returns its reason in notes — an
    // unconfigured API key, a failed search, an unparseable model response,
    // no confirmable primary source — and discarding it made a pipeline
    // producing zero drafts completely undiagnosable: the batch summary
    // could only say "skipped (no draft)" N times.
    await logSystemEvent({
      level: "WARN",
      source: "verification.batch",
      message: `No draft produced for SourceItem ${item.id}: ${result.notes}`,
      context: {
        sourceItemId: item.id,
        headline: item.headline,
        verificationStatus: result.verificationStatus,
        generationId: result.generationId,
      },
    });
    return { ok: false, skipReason: "no_draft", error: result.notes };
  }

  const slug = await ensureUniqueSlug(result.draft.headline);
  // Image acquisition is timed and its outcome captured separately from the
  // article-synthesis latency above — this is exactly the signal §21/§15
  // need to tell apart "the writing pipeline is slow" from "image fetching
  // is slow", and to tell apart "no image because nothing was findable"
  // from "no image because something broke".
  const imageResult = await featuredImageFieldsWithDiagnostics(item.id);
  const imageStatus = deriveImageStatus(imageResult.outcome, imageResult.reuseStatus);

  const article = await prisma.article.create({
    data: {
      slug,
      title: result.draft.headline,
      excerpt: result.draft.excerpt,
      content: { blocks: result.draft.blocks } as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
      categoryId: category.id,
      authorId: eligibleAuthor.id,
      createdById: actorId,
      metaDescription: result.draft.excerpt,
      pakistanRelevance: item.pakistanRelevance,
      verificationStatus: result.verificationStatus,
      primarySourceUrl: result.primarySourceUrl,
      secondarySourceUrl: result.secondarySourceUrl,
      verificationConfidence: result.verificationConfidence,
      claimsChecked: result.claimsChecked,
      verificationNotes: result.notes,
      originalityScore: result.originalityScore,
      verifiedAt: new Date(),
      verificationGenerationId: result.generationId,
      ...imageResult.fields,
    },
  });
  await prisma.articleSource.create({ data: { articleId: article.id, sourceId: item.sourceId } });

  // Runs for every draft, regardless of verification status — a
  // PRIMARY_SOURCE_NOT_FOUND article still gets its evidence and claims
  // persisted, since it still went to a human reviewer who benefits from
  // the same traceability. Only whether the RESULT can gate auto-publish
  // differs below.
  const evidenceForGate = result.evidence ?? EMPTY_EVIDENCE;
  const qualityGate = runQualityGate({
    headline: result.draft.headline,
    excerpt: result.draft.excerpt,
    blocks: result.draft.blocks,
    evidence: evidenceForGate,
  });
  await persistEvidenceAndClaims({
    generationId: result.generationId!,
    articleId: article.id,
    evidence: result.evidence,
    claims: qualityGate.claims,
  }).catch((err) => {
    // Traceability is additive infrastructure — losing it must never undo a
    // draft that was otherwise successfully created.
    void logSystemEvent({
      level: "WARN",
      source: "verification.batch",
      message: `Failed to persist evidence/claims for article ${article.id}: ${err instanceof Error ? err.message : String(err)}`,
      context: { articleId: article.id, generationId: result.generationId },
    });
  });

  let published = false;
  let rejectionReason: string | null = null;
  if (result.verificationStatus === "PRIMARY_SOURCE_CONFIRMED") {
    const mediaReuseStatus = imageResult.reuseStatus;

    const checks = evaluatePublicationChecks({
      title: article.title,
      slug: article.slug,
      categoryId: article.categoryId,
      authorId: article.authorId,
      blocks: result.draft.blocks,
      featuredImageUrl: article.featuredImageUrl,
      featuredImageAlt: article.featuredImageAlt,
      metaDescription: article.metaDescription,
      excerpt: article.excerpt,
      featuredMediaReuseStatus: mediaReuseStatus,
      // Guaranteed by ensureUniqueSlug's own construction (loops until
      // unused) — this is the "real uniqueness query" the check input
      // otherwise expects a caller to have already done.
      slugAvailable: true,
      // Guaranteed by pickEligibleAuthor's own construction above — stated
      // explicitly rather than relying on the "undefined never blocks"
      // default, so this stays correct if the code is ever reordered.
      authorEligible: true,
      originalityScore: result.originalityScore ?? undefined,
    });

    // The quality gate is a fourth, independent condition alongside the
    // three that already existed — valid JSON alone was never proof of
    // valid journalism. A HARD_FAIL_CODES failure here (an unsupported
    // claim, or the JSON layer somehow still producing something unusable)
    // blocks auto-publish exactly like a failed publication check or an
    // unallowlisted category already did.
    if (allChecksPassed(checks) && isCategoryAllowedForAutoPublish(category.slug) && qualityGate.passed) {
      const now = new Date();
      await prisma.article.update({
        where: { id: article.id },
        data: { status: "PUBLISHED", publishedAt: now, autoPublished: true },
      });

      const fullArticle = await prisma.article.findUniqueOrThrow({
        where: { id: article.id },
        include: { tags: { include: { tag: true } } },
      });
      await snapshotVersion({
        articleId: article.id,
        editorId: actorId,
        status: "PUBLISHED",
        title: fullArticle.title,
        snapshot: buildSnapshotFromArticleRow(fullArticle),
        changeSummary: "Status changed to PUBLISHED (auto-publish: verification confirmed)",
      });
      await logAction({
        userId: actorId,
        action: "article_published",
        entityType: "Article",
        entityId: article.id,
        metadata: { from: "DRAFT", to: "PUBLISHED", trigger: "auto-verify" },
      });

      published = true;
    } else {
      // Verification confirmed a primary source, but a publication check
      // failed (e.g. an acquired image not yet cleared for reuse), the
      // category isn't yet enabled for auto-publish
      // (AUTO_PUBLISH_CATEGORY_SLUGS), or the quality gate rejected it —
      // any of those surfaces it higher in the human queue rather than
      // leaving it an easy-to-miss bare DRAFT.
      await prisma.article.update({ where: { id: article.id }, data: { status: "IN_REVIEW" } });
      rejectionReason = !qualityGate.passed
        ? `Quality gate: ${qualityGate.failures.map((f) => f.code).join(", ")}`
        : !allChecksPassed(checks)
          ? `Publication checks failed: ${checks.filter((c) => !c.passed).map((c) => c.id).join(", ")}`
          : "Category not in auto-publish allowlist";
    }
  } else {
    rejectionReason = `Verification status is ${result.verificationStatus}, not PRIMARY_SOURCE_CONFIRMED`;
  }

  await recordGenerationMetric({
    generationId: result.generationId!,
    sourceItemId: item.id,
    articleId: article.id,
    modelId: aiModelId(),
    evidence: result.evidence,
    blocks: result.draft.blocks,
    quality: qualityGate,
    retryCount: result.retryCount,
    latencyMs,
    sentToReview: !published,
    autoPublished: published,
    rejectionReason,
    triggerType,
    sourceExtractionSuccess: result.evidence?.documents.some((d) => d.isOriginatingOutlet) ?? null,
    imageOutcome: imageResult.outcome,
    imageStatus,
    imageFailureReason: imageResult.outcome === "ALL_CANDIDATES_FAILED" || imageResult.outcome === "ERROR" ? rejectionReason ?? "Image acquisition failed" : null,
    imageLatencyMs: imageResult.latencyMs,
  }).catch(() => {
    // Same posture as every metrics write in this file: never break the
    // batch over an observability failure.
  });

  await prisma.sourceItem.update({
    where: { id: item.id },
    data: { status: "CONVERTED_TO_DRAFT", convertedArticleId: article.id, reviewedById: actorId },
  });

  return { ok: true, articleId: article.id, published };
}

export interface VerificationBatchSummary {
  itemsProcessed: number;
  draftsCreated: number;
  autoPublished: number;
  sentToReview: number;
  skippedNoDraft: number;
  skippedNoEligibleAuthor: number;
  skippedNoCategory: number;
  failed: number;
}

const DEFAULT_LIMIT = 1;

function emptySummary(): VerificationBatchSummary {
  return {
    itemsProcessed: 0,
    draftsCreated: 0,
    autoPublished: 0,
    sentToReview: 0,
    skippedNoDraft: 0,
    skippedNoEligibleAuthor: 0,
    skippedNoCategory: 0,
    failed: 0,
  };
}

/**
 * Claims a bounded batch of NEW SourceItems and runs processOneItem against
 * each. Additive to, never a replacement for, the existing manual
 * createDraftFromItemAction path (lib/discovery-actions.ts) or the
 * editor-triggered verifySourceItem below — an item this batch can't
 * produce a draft for (search/AI not configured, or nothing usable found)
 * is simply left NEW.
 *
 * limit defaults to VERIFY_BATCH_SIZE (see .env.example for the Tavily
 * free-tier quota arithmetic behind the default of 1) rather than an
 * unbounded claim — each item costs one search credit.
 */
export async function processVerificationBatch(
  limit: number = Number(process.env.VERIFY_BATCH_SIZE) || DEFAULT_LIMIT,
): Promise<VerificationBatchSummary> {
  const summary = emptySummary();
  const systemUserId = await getSystemUserId();

  const items = await prisma.sourceItem.findMany({
    where: { status: "NEW" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { source: true, category: true },
  });
  if (items.length === 0) return summary;

  // Same precondition createDraftFromItemAction enforces for the
  // human-triggered path — without a category to assign an uncategorized
  // item to, there's nothing this batch can do with it. Deliberately looked
  // up by a fixed slug, never "whichever Category sorts first" — see
  // UNCATEGORIZED_CATEGORY_SLUG's comment. Author eligibility is
  // per-category, so it's checked per-item below, not as a single upfront
  // guard.
  const fallbackCategory = await prisma.category.findUnique({ where: { slug: UNCATEGORIZED_CATEGORY_SLUG } });

  for (const item of items) {
    summary.itemsProcessed += 1;
    try {
      const outcome = await processOneItem({ item, fallbackCategory, actorId: systemUserId, triggerType: "batch_cron" });
      if (outcome.skipReason === "no_category") summary.skippedNoCategory += 1;
      else if (outcome.skipReason === "no_eligible_author") summary.skippedNoEligibleAuthor += 1;
      else if (outcome.skipReason === "no_draft") summary.skippedNoDraft += 1;
      else if (outcome.ok) {
        summary.draftsCreated += 1;
        if (outcome.published) summary.autoPublished += 1;
        else summary.sentToReview += 1;
      }
    } catch (err) {
      summary.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await logSystemEvent({
        level: "WARN",
        source: "verification.batch",
        message: `Verification failed for SourceItem ${item.id}: ${message}`,
        context: { sourceItemId: item.id },
      });
      // Left as-is (still NEW) — retried on the next batch, same
      // defense-in-depth posture as every other per-item loop in this
      // codebase (e.g. lib/ingestion/ingest.ts's image acquisition).
    }
  }

  return summary;
}

/**
 * The single-item counterpart to processVerificationBatch — runs the exact
 * same evidence-first pipeline for one named SourceItem, regardless of its
 * current status (NEW, REVIEWING, VERIFIED, POSSIBLE_DUPLICATE — anything
 * except an item already converted), attributed to the editor who requested
 * it rather than the SYSTEM actor. This is what "Write with AI" calls.
 *
 * Idempotency is the caller's responsibility (see writeWithAIAction's
 * compare-and-swap on SourceItem.aiStatus) — this function itself always
 * runs the pipeline when called; it does not check for or refuse a second
 * concurrent generation on its own.
 */
export async function verifySourceItem(params: { itemId: string; actorId: string; triggerType: string }): Promise<SingleItemOutcome> {
  const item = await prisma.sourceItem.findUnique({
    where: { id: params.itemId },
    include: { source: true, category: true },
  });
  if (!item) return { ok: false, skipReason: "not_found", error: "This discovery item no longer exists." };

  const fallbackCategory = item.categoryId
    ? null
    : await prisma.category.findUnique({ where: { slug: UNCATEGORIZED_CATEGORY_SLUG } });

  return processOneItem({ item, fallbackCategory, actorId: params.actorId, triggerType: params.triggerType });
}
