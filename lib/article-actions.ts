"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { requireRole, getSessionUser, ForbiddenError } from "./auth";
import { CAN_WRITE, CAN_OVERRIDE_AUTHOR_ELIGIBILITY, CAN_DELETE_ARTICLE, canEditArticle } from "./permissions";
import { isAuthorEligibleForCategory } from "./author-eligibility";
import { assertTransition, type TransitionName, WorkflowError } from "./workflow";
import { evaluatePublicationChecks } from "./publication-checks";
import { ensureUniqueSlug, slugify } from "./slug";
import { joinPakistanImpact, splitPakistanImpact, type ContentBlock } from "./content-blocks";
import { estimateReadingTime } from "./reading-time";
import { logAction } from "./audit";
import { notify } from "./notifications";
import { buildSnapshotFromArticleRow, snapshotVersion } from "./article-snapshot";
import type { Prisma, Role } from "@prisma/client";

// Every route under /admin reads the session cookie (via requireUser/
// getSessionUser), which already forces Next to render those routes
// dynamically on every request — and the public (site) routes are marked
// `force-dynamic` in app/(site)/layout.tsx — so there is no page cache here
// for revalidatePath to invalidate. Deliberately not calling it.

const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: z.string() }),
  z.object({ type: z.literal("quote"), text: z.string(), cite: z.string().optional() }),
  z.object({
    type: z.literal("list"),
    style: z.union([z.literal("bullet"), z.literal("number")]),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal("image"),
    url: z.string(),
    alt: z.string(),
    caption: z.string().optional(),
    credit: z.string().optional(),
  }),
  z.object({ type: z.literal("pakistan-impact"), text: z.string() }),
]) satisfies z.ZodType<ContentBlock>;

const articleInputSchema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  subheadline: z.string().trim(),
  excerpt: z.string().trim(),
  blocks: z.array(blockSchema),
  pakistanImpact: z.string().trim(),
  categoryId: z.string().min(1),
  authorId: z.string().min(1),
  tagNames: z.array(z.string().trim()).max(20),
  locationName: z.string().trim(),
  featuredImageUrl: z.string().trim(),
  featuredImageAlt: z.string().trim(),
  featuredImageCaption: z.string().trim(),
  featuredImageCredit: z.string().trim(),
  // Provenance cross-reference kept in lockstep with featuredImageUrl by the
  // client (ArticleEditor.tsx) — see invariant rule 4 in the
  // image-acquisition plan. Empty string means "no linked Media row."
  featuredMediaId: z.string().trim(),
  seoTitle: z.string().trim(),
  metaDescription: z.string().trim(),
  canonicalUrl: z.string().trim(),
  ogImage: z.string().trim(),
  isBreaking: z.boolean(),
  featured: z.boolean(),
  pakistanRelevance: z.number().min(0).max(100),
  regionalRelevance: z.number().min(0).max(100),
  globalSignificance: z.number().min(0).max(100),
  scheduledAt: z.string().trim(),
  // Always starts unchecked client-side per submission — an explicit,
  // re-confirmed choice each time an ineligible pairing is saved, not
  // persisted form state. See resolveAuthorEligibility below.
  overrideAuthorEligibility: z.boolean(),
});

export type ArticleFormInput = z.infer<typeof articleInputSchema>;

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

function nullable(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

async function syncTags(articleId: string, tagNames: string[]): Promise<void> {
  const names = [...new Set(tagNames.map((n) => n.trim()).filter(Boolean))];

  const tagIds: string[] = [];
  for (const name of names) {
    const tag = await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
    tagIds.push(tag.id);
  }

  const existing = await prisma.articleTag.findMany({ where: { articleId } });
  const existingIds = new Set(existing.map((t) => t.tagId));
  const nextIds = new Set(tagIds);

  const toRemove = existing.filter((t) => !nextIds.has(t.tagId));
  const toAdd = tagIds.filter((id) => !existingIds.has(id));

  if (toRemove.length) {
    await prisma.articleTag.deleteMany({
      where: { articleId, tagId: { in: toRemove.map((t) => t.tagId) } },
    });
  }
  if (toAdd.length) {
    await prisma.articleTag.createMany({
      data: toAdd.map((tagId) => ({ articleId, tagId })),
    });
  }
}

function buildSnapshot(input: ArticleFormInput, blocks: ContentBlock[], verifiedFeaturedMediaId: string | null): Prisma.InputJsonValue {
  return {
    title: input.title,
    subheadline: nullable(input.subheadline),
    excerpt: nullable(input.excerpt),
    blocks,
    categoryId: input.categoryId,
    authorId: input.authorId,
    tagNames: input.tagNames,
    locationName: nullable(input.locationName),
    featuredImageUrl: nullable(input.featuredImageUrl),
    featuredImageAlt: nullable(input.featuredImageAlt),
    featuredImageCaption: nullable(input.featuredImageCaption),
    featuredImageCredit: nullable(input.featuredImageCredit),
    featuredMediaId: verifiedFeaturedMediaId,
    seoTitle: nullable(input.seoTitle),
    metaDescription: nullable(input.metaDescription),
    canonicalUrl: nullable(input.canonicalUrl),
    ogImage: nullable(input.ogImage),
  } as unknown as Prisma.InputJsonValue;
}

/** Server-side trust boundary for invariant rule 4: a client-submitted
 * featuredMediaId is only honored when it actually resolves to a Media row
 * whose stored url matches the submitted featuredImageUrl. Without this, a
 * crafted request (bypassing the UI's lockstep patching) could pair an
 * approved Media id with an unrelated featuredImageUrl and sail through the
 * publication check, which only inspects whatever featuredMediaId resolves
 * to. A mismatch falls back to null — the same "no linked media" state an
 * ordinary hand-typed URL already has today, not an error. */
async function verifiedFeaturedMediaId(featuredMediaId: string, featuredImageUrl: string): Promise<string | null> {
  if (!featuredMediaId) return null;
  const media = await prisma.media.findUnique({ where: { id: featuredMediaId }, select: { url: true } });
  return media && media.url === featuredImageUrl ? featuredMediaId : null;
}

// buildSnapshotFromArticleRow/snapshotVersion moved to lib/article-snapshot.ts
// — a "use server" file's exports must all be async functions, and
// buildSnapshotFromArticleRow is a plain sync helper. Shared with
// app/api/cron/publish-scheduled/route.ts from that non-"use server" module.

/** Prevention layer for the (authorId, categoryId) eligibility invariant —
 * lib/publication-checks.ts's author-eligibility check is the backstop for
 * paths (restoreVersionAction) that bypass this. An already-accepted
 * override doesn't need re-ticking on every unrelated edit: if the saved
 * pairing is unchanged from `existing` and was already overridden, it
 * stays overridden without requiring the checkbox again. */
async function resolveAuthorEligibility(
  input: { authorId: string; categoryId: string; overrideAuthorEligibility: boolean },
  existing: { authorId: string; categoryId: string; authorEligibilityOverridden: boolean } | null,
  actorRole: Role,
): Promise<{ ok: true; overridden: boolean } | { ok: false; error: string }> {
  const author = await prisma.author.findUnique({
    where: { id: input.authorId },
    select: { name: true, categories: { select: { id: true } } },
  });
  if (!author) return { ok: false, error: "Selected author not found." };

  const eligibleCategoryIds = author.categories.map((c) => c.id);
  if (isAuthorEligibleForCategory(eligibleCategoryIds, input.categoryId)) return { ok: true, overridden: false };

  if (input.overrideAuthorEligibility && CAN_OVERRIDE_AUTHOR_ELIGIBILITY.includes(actorRole)) {
    return { ok: true, overridden: true };
  }

  if (
    existing &&
    existing.authorId === input.authorId &&
    existing.categoryId === input.categoryId &&
    existing.authorEligibilityOverridden
  ) {
    return { ok: true, overridden: true };
  }

  const category = await prisma.category.findUnique({ where: { id: input.categoryId }, select: { name: true } });
  return {
    ok: false,
    error: `"${author.name}" is not eligible for the "${category?.name ?? "selected"}" category. Choose an eligible author, or check the override box (admin only).`,
  };
}

export async function createArticleAction(raw: ArticleFormInput): Promise<ActionResult<{ id: string; slug: string }>> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_WRITE);

  const parsed = articleInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const input = parsed.data;

  const eligibility = await resolveAuthorEligibility(input, null, user.role);
  if (!eligibility.ok) return { ok: false, error: eligibility.error };

  const slug = await ensureUniqueSlug(input.slug || input.title);
  const blocks = joinPakistanImpact(input.blocks, input.pakistanImpact);
  const featuredMediaId = await verifiedFeaturedMediaId(input.featuredMediaId, input.featuredImageUrl);

  const article = await prisma.article.create({
    data: {
      slug,
      title: input.title,
      subheadline: nullable(input.subheadline),
      excerpt: nullable(input.excerpt),
      content: { blocks } as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
      isBreaking: input.isBreaking,
      featured: input.featured,
      isDemo: false,
      pakistanRelevance: input.pakistanRelevance,
      regionalRelevance: input.regionalRelevance,
      globalSignificance: input.globalSignificance,
      readingTime: estimateReadingTime(blocks),
      categoryId: input.categoryId,
      authorId: input.authorId,
      authorEligibilityOverridden: eligibility.overridden,
      createdById: user.id,
      locationName: nullable(input.locationName),
      featuredImageUrl: nullable(input.featuredImageUrl),
      featuredImageAlt: nullable(input.featuredImageAlt),
      featuredImageCaption: nullable(input.featuredImageCaption),
      featuredImageCredit: nullable(input.featuredImageCredit),
      featuredMediaId,
      seoTitle: nullable(input.seoTitle),
      metaDescription: nullable(input.metaDescription),
      canonicalUrl: nullable(input.canonicalUrl),
      ogImage: nullable(input.ogImage),
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    },
  });

  await syncTags(article.id, input.tagNames);
  await snapshotVersion({
    articleId: article.id,
    editorId: user.id,
    status: article.status,
    title: article.title,
    snapshot: buildSnapshot(input, blocks, featuredMediaId),
    changeSummary: "Created",
  });
  await logAction({ userId: user.id, action: "article_created", entityType: "Article", entityId: article.id });
  if (eligibility.overridden) {
    await logAction({
      userId: user.id,
      action: "author_eligibility_override_used",
      entityType: "Article",
      entityId: article.id,
      metadata: { authorId: input.authorId, categoryId: input.categoryId },
    });
  }

  return { ok: true, data: { id: article.id, slug: article.slug } };
}

export async function updateArticleAction(articleId: string, raw: ArticleFormInput): Promise<ActionResult<{ slug: string }>> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_WRITE);

  const existing = await prisma.article.findUnique({ where: { id: articleId } });
  if (!existing) return { ok: false, error: "Article not found." };
  if (!canEditArticle(user.role, existing, user.id)) {
    throw new ForbiddenError("You can only edit your own drafts, and only before they're submitted for review.");
  }

  const parsed = articleInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const input = parsed.data;

  const eligibility = await resolveAuthorEligibility(
    input,
    { authorId: existing.authorId, categoryId: existing.categoryId, authorEligibilityOverridden: existing.authorEligibilityOverridden },
    user.role,
  );
  if (!eligibility.ok) return { ok: false, error: eligibility.error };

  const slug =
    slugify(input.slug) === existing.slug ? existing.slug : await ensureUniqueSlug(input.slug, articleId);
  const blocks = joinPakistanImpact(input.blocks, input.pakistanImpact);
  const featuredMediaId = await verifiedFeaturedMediaId(input.featuredMediaId, input.featuredImageUrl);

  const article = await prisma.article.update({
    where: { id: articleId },
    data: {
      slug,
      title: input.title,
      subheadline: nullable(input.subheadline),
      excerpt: nullable(input.excerpt),
      content: { blocks } as unknown as Prisma.InputJsonValue,
      isBreaking: input.isBreaking,
      featured: input.featured,
      pakistanRelevance: input.pakistanRelevance,
      regionalRelevance: input.regionalRelevance,
      globalSignificance: input.globalSignificance,
      readingTime: estimateReadingTime(blocks),
      categoryId: input.categoryId,
      authorId: input.authorId,
      authorEligibilityOverridden: eligibility.overridden,
      locationName: nullable(input.locationName),
      featuredImageUrl: nullable(input.featuredImageUrl),
      featuredImageAlt: nullable(input.featuredImageAlt),
      featuredImageCaption: nullable(input.featuredImageCaption),
      featuredImageCredit: nullable(input.featuredImageCredit),
      featuredMediaId,
      seoTitle: nullable(input.seoTitle),
      metaDescription: nullable(input.metaDescription),
      canonicalUrl: nullable(input.canonicalUrl),
      ogImage: nullable(input.ogImage),
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    },
  });

  await syncTags(article.id, input.tagNames);
  await snapshotVersion({
    articleId: article.id,
    editorId: user.id,
    status: article.status,
    title: article.title,
    snapshot: buildSnapshot(input, blocks, featuredMediaId),
    changeSummary: "Edited",
  });
  await logAction({ userId: user.id, action: "article_edited", entityType: "Article", entityId: article.id });
  // Only log a fresh override, not every subsequent unrelated edit to an
  // article whose pairing was already overridden.
  const isNewOverride =
    eligibility.overridden &&
    (!existing.authorEligibilityOverridden || existing.authorId !== input.authorId || existing.categoryId !== input.categoryId);
  if (isNewOverride) {
    await logAction({
      userId: user.id,
      action: "author_eligibility_override_used",
      entityType: "Article",
      entityId: article.id,
      metadata: { authorId: input.authorId, categoryId: input.categoryId },
    });
  }

  return { ok: true, data: { slug: article.slug } };
}

export async function transitionArticleAction(articleId: string, name: TransitionName): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) throw new ForbiddenError("You must be signed in.");

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { tags: { include: { tag: true } }, featuredMedia: { select: { reuseStatus: true } } },
  });
  if (!article) return { ok: false, error: "Article not found." };

  let newStatus;
  try {
    newStatus = assertTransition(name, article, sessionUser);
  } catch (err) {
    if (err instanceof WorkflowError) return { ok: false, error: err.message };
    throw err;
  }

  if (name === "publish" || name === "schedule") {
    const slugAvailable = await prisma.article
      .findFirst({ where: { slug: article.slug, NOT: { id: article.id } } })
      .then((row) => !row);
    // Backstop for restoreVersionAction, which bypasses create/update's
    // prevention layer entirely by writing (authorId, categoryId) straight
    // from an ArticleVersion snapshot.
    const author = await prisma.author.findUnique({ where: { id: article.authorId }, select: { categories: { select: { id: true } } } });
    const authorEligible = author ? isAuthorEligibleForCategory(author.categories.map((c) => c.id), article.categoryId) : false;
    const content = article.content as unknown as { blocks?: ContentBlock[] };
    const { blocks } = splitPakistanImpact(content.blocks ?? []);
    const checks = evaluatePublicationChecks({
      title: article.title,
      slug: article.slug,
      categoryId: article.categoryId,
      authorId: article.authorId,
      blocks,
      featuredImageUrl: article.featuredImageUrl,
      featuredImageAlt: article.featuredImageAlt,
      metaDescription: article.metaDescription,
      excerpt: article.excerpt,
      featuredMediaReuseStatus: article.featuredMedia?.reuseStatus ?? null,
      slugAvailable,
      authorEligible,
      authorEligibilityOverridden: article.authorEligibilityOverridden,
    });
    const failed = checks.find((c) => !c.passed);
    if (failed) return { ok: false, error: `Publication check failed: ${failed.label} — ${failed.reason}` };

    if (name === "schedule" && (!article.scheduledAt || article.scheduledAt <= new Date())) {
      return { ok: false, error: "Set a future scheduled date/time before scheduling." };
    }
  }

  const now = new Date();
  await prisma.article.update({
    where: { id: articleId },
    data: {
      status: newStatus,
      publishedAt: newStatus === "PUBLISHED" && !article.publishedAt ? now : undefined,
    },
  });

  await snapshotVersion({
    articleId,
    editorId: sessionUser.id,
    status: newStatus,
    title: article.title,
    snapshot: buildSnapshotFromArticleRow(article),
    changeSummary: `Status changed to ${newStatus}`,
  });

  await logAction({
    userId: sessionUser.id,
    action: `article_${name}`,
    entityType: "Article",
    entityId: articleId,
    metadata: { from: article.status, to: newStatus },
  });

  await notifyForTransition(name, article, articleId);

  return { ok: true };
}

/** High-value transitions get a notification (in-app + email if configured)
 * — most transitions are in-app-only or unnotified; this is deliberately a
 * small allowlist, not a notification for every workflow event. Never
 * throws: a notification failure must never block the transition it's
 * describing (already enforced by notify() itself, but the EDITOR/ADMIN
 * broadcast loop below stays defensive too). */
async function notifyForTransition(
  name: TransitionName,
  article: { createdById: string | null; title: string },
  articleId: string,
): Promise<void> {
  const link = `/admin/articles/${articleId}`;

  if (name === "submit") {
    const editors = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "EDITOR"] }, active: true },
      select: { id: true },
    });
    await Promise.all(
      editors.map((e) =>
        notify({
          userId: e.id,
          type: "article_submitted",
          title: "Article submitted for review",
          body: `"${article.title}" is ready for review.`,
          link,
          email: true,
        }),
      ),
    );
    return;
  }

  if (!article.createdById) return; // demo articles have no owning user to notify

  if (name === "requestChanges") {
    await notify({
      userId: article.createdById,
      type: "article_changes_requested",
      title: "Changes requested on your article",
      body: `An editor requested changes to "${article.title}".`,
      link,
      email: true,
    });
  } else if (name === "approve") {
    await notify({
      userId: article.createdById,
      type: "article_approved",
      title: "Your article was approved",
      body: `"${article.title}" was approved.`,
      link,
      email: true,
    });
  } else if (name === "reject") {
    await notify({
      userId: article.createdById,
      type: "article_rejected",
      title: "Your article was rejected",
      body: `"${article.title}" was rejected. It can still be reopened as a draft if the decision changes.`,
      link,
      email: true,
    });
  } else if (name === "publish") {
    await notify({
      userId: article.createdById,
      type: "article_published",
      title: "Your article was published",
      body: `"${article.title}" is now live.`,
      link,
      email: true,
    });
  }
}

export async function restoreVersionAction(articleId: string, versionId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_WRITE);

  const [article, version] = await Promise.all([
    prisma.article.findUnique({ where: { id: articleId } }),
    prisma.articleVersion.findUnique({ where: { id: versionId } }),
  ]);
  if (!article || !version || version.articleId !== articleId) {
    throw new Error("Version not found.");
  }
  if (!canEditArticle(user.role, article, user.id)) {
    throw new ForbiddenError("You can only edit your own drafts, and only before they're submitted for review.");
  }

  const snap = version.snapshot as unknown as {
    title: string;
    subheadline: string | null;
    excerpt: string | null;
    blocks: ContentBlock[];
    categoryId: string;
    authorId: string;
    tagNames: string[];
    locationName: string | null;
    featuredImageUrl: string | null;
    featuredImageAlt: string | null;
    featuredImageCaption: string | null;
    featuredImageCredit: string | null;
    featuredMediaId?: string | null;
    seoTitle: string | null;
    metaDescription: string | null;
    canonicalUrl: string | null;
    ogImage: string | null;
  };

  const updated = await prisma.article.update({
    where: { id: articleId },
    data: {
      title: snap.title,
      subheadline: snap.subheadline,
      excerpt: snap.excerpt,
      content: { blocks: snap.blocks ?? [] } as unknown as Prisma.InputJsonValue,
      categoryId: snap.categoryId,
      authorId: snap.authorId,
      locationName: snap.locationName,
      featuredImageUrl: snap.featuredImageUrl,
      featuredImageAlt: snap.featuredImageAlt,
      featuredImageCaption: snap.featuredImageCaption,
      featuredImageCredit: snap.featuredImageCredit,
      // Explicit null fallback (not just omitting the field) for snapshots
      // captured before this field existed — restoring must never leave a
      // stale featuredMediaId pointing at a different image than the
      // featuredImageUrl this same restore just wrote. See invariant rule 4.
      featuredMediaId: snap.featuredMediaId ?? null,
      seoTitle: snap.seoTitle,
      metaDescription: snap.metaDescription,
      canonicalUrl: snap.canonicalUrl,
      ogImage: snap.ogImage,
      readingTime: estimateReadingTime(snap.blocks ?? []),
    },
  });

  await syncTags(articleId, snap.tagNames ?? []);
  await snapshotVersion({
    articleId,
    editorId: user.id,
    status: updated.status,
    title: updated.title,
    snapshot: version.snapshot as Prisma.InputJsonValue,
    changeSummary: `Restored from version ${version.versionNumber}`,
  });
  await logAction({
    userId: user.id,
    action: "article_version_restored",
    entityType: "Article",
    entityId: articleId,
    metadata: { restoredFromVersion: version.versionNumber },
  });

  redirect(`/admin/articles/${articleId}/versions`);
}

/** A genuine hard delete — no undo, unlike every other workflow transition
 * (which land on ARCHIVED/REJECTED, both still visible and reversible in
 * the admin UI). ArticleTag/ArticleVersion/ArticleSource/Relation rows
 * cascade with it; Media.articleId, PageView.articleId, and
 * SourceItem.convertedArticleId just lose the reference (SetNull) rather
 * than blocking the delete or disappearing themselves. */
export async function deleteArticleAction(articleId: string): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_DELETE_ARTICLE);

  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { title: true, status: true } });
  if (!article) return { ok: false, error: "Article not found." };

  await prisma.article.delete({ where: { id: articleId } });

  await logAction({
    userId: user.id,
    action: "article_deleted",
    entityType: "Article",
    entityId: articleId,
    metadata: { title: article.title, statusAtDeletion: article.status },
  });

  return { ok: true };
}

/**
 * Wipes every Article — every status, published included. Deliberately a
 * distinct, explicit action rather than a bulk "select rows, click Delete"
 * flow: there is no per-item confirmation possible at this scale, so the
 * one confirmation this has (the caller must pass the exact literal
 * "DELETE ALL ARTICLES", enforced server-side, not just a disabled button)
 * has to carry the whole weight. Same ADMIN-only bar as the single-article
 * delete. Verified against the schema's own onDelete clauses: ArticleTag/
 * ArticleVersion/ArticleSource/Relation cascade; DigestItem.article,
 * PageView.article, Media's tagged-for-article link, and
 * SourceItem.convertedArticleId all set null instead — a discovery record,
 * a digest entry, a page-view log row, or an uploaded image never
 * disappears just because the article it pointed to did. Category, Author,
 * Source, SourceItem, StoryCluster, and Claim rows themselves are
 * completely untouched either way.
 */
export async function deleteAllArticlesAction(confirmationPhrase: string): Promise<ActionResult<{ count: number }>> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_DELETE_ARTICLE);

  if (confirmationPhrase !== "DELETE ALL ARTICLES") {
    return { ok: false, error: 'Type the exact phrase "DELETE ALL ARTICLES" to confirm.' };
  }

  const articles = await prisma.article.findMany({ select: { id: true, title: true, status: true } });
  if (articles.length === 0) return { ok: true, data: { count: 0 } };

  await prisma.article.deleteMany({});

  await logAction({
    userId: user.id,
    action: "all_articles_deleted",
    entityType: "Article",
    metadata: { count: articles.length, titles: articles.map((a) => a.title).slice(0, 200) },
  });

  return { ok: true, data: { count: articles.length } };
}
