import "server-only";
import { prisma } from "./prisma";
import { getSystemUserId } from "./system-actor";
import { verifyAndSynthesize } from "./ai/verify-and-synthesize";
import { pickEligibleAuthor } from "./author-eligibility";
import { ensureUniqueSlug } from "./slug";
import { featuredImageFieldsFor } from "./images/featured-image";
import { evaluatePublicationChecks, allChecksPassed } from "./publication-checks";
import { snapshotVersion, buildSnapshotFromArticleRow } from "./article-snapshot";
import { logAction } from "./audit";
import { logSystemEvent } from "./monitoring";
import type { Prisma } from "@prisma/client";

export interface VerificationBatchSummary {
  itemsProcessed: number;
  draftsCreated: number;
  autoPublished: number;
  sentToReview: number;
  skippedNoDraft: number;
  skippedNoEligibleAuthor: number;
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
    failed: 0,
  };
}

/**
 * Kill switch / gradual-rollout control: a category must be explicitly
 * listed in AUTO_PUBLISH_CATEGORY_SLUGS (comma-separated slugs) before this
 * pipeline will ever auto-publish into it. Defaults to empty — meaning
 * nothing auto-publishes anywhere — so a fresh deploy starts in pure
 * "verify + synthesize -> human review" mode, matching the recommended
 * trial period before enabling auto-publish for selected high-confidence
 * categories.
 */
function isCategoryAllowedForAutoPublish(categorySlug: string): boolean {
  const raw = process.env.AUTO_PUBLISH_CATEGORY_SLUGS ?? "";
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(categorySlug);
}

/**
 * Claims a bounded batch of NEW SourceItems, verifies each against known
 * primary/secondary sources (lib/ai/verify-and-synthesize.ts), and either
 * auto-publishes the synthesized draft or routes it to human review.
 * Additive to, never a replacement for, the existing manual
 * createDraftFromItemAction path (lib/discovery-actions.ts) — an item this
 * batch can't produce a draft for (search/AI not configured, or nothing
 * usable found) is simply left NEW.
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
  // human-triggered path — without at least one Category to assign, there's
  // nothing this batch can do. Author eligibility is per-category now, so
  // it's checked per-item below, not as a single upfront guard.
  const fallbackCategory = await prisma.category.findFirst({ orderBy: { name: "asc" } });
  if (!fallbackCategory) return summary;

  for (const item of items) {
    summary.itemsProcessed += 1;
    try {
      const category = item.category ?? fallbackCategory;

      // Checked BEFORE the paid search call in verifyAndSynthesize — no
      // point burning a Tavily credit on an item that can't produce an
      // eligible draft anyway. "No eligible author" must never fall back to
      // *any* author; it's an operator-visible skip, not a silent wrong
      // assignment.
      const eligibleAuthor = await pickEligibleAuthor(category.id);
      if (!eligibleAuthor) {
        summary.skippedNoEligibleAuthor += 1;
        await logSystemEvent({
          level: "WARN",
          source: "verification.batch",
          message: `No active author is eligible for category "${category.name}" — SourceItem ${item.id} left for a future run.`,
          context: { sourceItemId: item.id, categoryId: category.id },
        });
        continue;
      }

      const result = await verifyAndSynthesize({ requestedById: systemUserId, item });

      if (!result.draft) {
        summary.skippedNoDraft += 1;
        continue;
      }

      const slug = await ensureUniqueSlug(result.draft.headline);
      const imageFields = await featuredImageFieldsFor(item.id);

      const article = await prisma.article.create({
        data: {
          slug,
          title: result.draft.headline,
          excerpt: result.draft.excerpt,
          content: { blocks: result.draft.blocks } as unknown as Prisma.InputJsonValue,
          status: "DRAFT",
          categoryId: category.id,
          authorId: eligibleAuthor.id,
          createdById: systemUserId,
          metaDescription: result.draft.excerpt,
          pakistanRelevance: item.pakistanRelevance,
          verificationStatus: result.verificationStatus,
          primarySourceUrl: result.primarySourceUrl,
          secondarySourceUrl: result.secondarySourceUrl,
          verificationConfidence: result.verificationConfidence,
          claimsChecked: result.claimsChecked,
          verificationNotes: result.notes,
          verifiedAt: new Date(),
          verificationGenerationId: result.generationId,
          ...imageFields,
        },
      });
      await prisma.articleSource.create({ data: { articleId: article.id, sourceId: item.sourceId } });
      summary.draftsCreated += 1;

      let published = false;
      if (result.verificationStatus === "PRIMARY_SOURCE_CONFIRMED") {
        const mediaReuseStatus = imageFields.featuredMediaId
          ? (await prisma.media.findUnique({ where: { id: imageFields.featuredMediaId }, select: { reuseStatus: true } }))
              ?.reuseStatus ?? null
          : null;

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
          // Guaranteed by pickEligibleAuthor's own construction above —
          // stated explicitly rather than relying on the "undefined never
          // blocks" default, so this stays correct if the code is ever
          // reordered.
          authorEligible: true,
        });

        if (allChecksPassed(checks) && isCategoryAllowedForAutoPublish(category.slug)) {
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
            editorId: systemUserId,
            status: "PUBLISHED",
            title: fullArticle.title,
            snapshot: buildSnapshotFromArticleRow(fullArticle),
            changeSummary: "Status changed to PUBLISHED (auto-publish: verification confirmed)",
          });
          await logAction({
            userId: systemUserId,
            action: "article_published",
            entityType: "Article",
            entityId: article.id,
            metadata: { from: "DRAFT", to: "PUBLISHED", trigger: "auto-verify" },
          });

          published = true;
          summary.autoPublished += 1;
        } else {
          // Verification confirmed a primary source, but either a
          // publication check still failed (e.g. an acquired image not yet
          // cleared for reuse) or this category isn't yet enabled for
          // auto-publish (AUTO_PUBLISH_CATEGORY_SLUGS) — either way, surface
          // it higher in the human queue rather than leaving it an
          // easy-to-miss bare DRAFT.
          await prisma.article.update({ where: { id: article.id }, data: { status: "IN_REVIEW" } });
        }
      }

      if (!published) summary.sentToReview += 1;

      await prisma.sourceItem.update({
        where: { id: item.id },
        data: { status: "CONVERTED_TO_DRAFT", convertedArticleId: article.id, reviewedById: systemUserId },
      });
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
