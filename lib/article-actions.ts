"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { requireRole, getSessionUser, ForbiddenError } from "./auth";
import { CAN_WRITE, canEditArticle } from "./permissions";
import { assertTransition, type TransitionName, WorkflowError } from "./workflow";
import { evaluatePublicationChecks } from "./publication-checks";
import { ensureUniqueSlug, slugify } from "./slug";
import { joinPakistanImpact, splitPakistanImpact, type ContentBlock } from "./content-blocks";
import { estimateReadingTime } from "./reading-time";
import { logAction } from "./audit";
import type { Prisma } from "@prisma/client";

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

function buildSnapshot(input: ArticleFormInput, blocks: ContentBlock[]): Prisma.InputJsonValue {
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
    seoTitle: nullable(input.seoTitle),
    metaDescription: nullable(input.metaDescription),
    canonicalUrl: nullable(input.canonicalUrl),
    ogImage: nullable(input.ogImage),
  } as unknown as Prisma.InputJsonValue;
}

/** Snapshot straight from a DB row (used by workflow transitions, which
 * change status/publishedAt but not the editable content itself). */
function buildSnapshotFromArticleRow(
  article: Prisma.ArticleGetPayload<{ include: { tags: { include: { tag: true } } } }>,
): Prisma.InputJsonValue {
  return {
    title: article.title,
    subheadline: article.subheadline,
    excerpt: article.excerpt,
    blocks: (article.content as unknown as { blocks?: ContentBlock[] }).blocks ?? [],
    categoryId: article.categoryId,
    authorId: article.authorId,
    tagNames: article.tags.map((t) => t.tag.name),
    locationName: article.locationName,
    featuredImageUrl: article.featuredImageUrl,
    featuredImageAlt: article.featuredImageAlt,
    featuredImageCaption: article.featuredImageCaption,
    featuredImageCredit: article.featuredImageCredit,
    seoTitle: article.seoTitle,
    metaDescription: article.metaDescription,
    canonicalUrl: article.canonicalUrl,
    ogImage: article.ogImage,
  } as unknown as Prisma.InputJsonValue;
}

async function nextVersionNumber(articleId: string): Promise<number> {
  const last = await prisma.articleVersion.findFirst({
    where: { articleId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return (last?.versionNumber ?? 0) + 1;
}

async function snapshotVersion(params: {
  articleId: string;
  editorId: string;
  status: Prisma.ArticleGetPayload<object>["status"];
  title: string;
  snapshot: Prisma.InputJsonValue;
  changeSummary?: string;
}): Promise<void> {
  const versionNumber = await nextVersionNumber(params.articleId);
  await prisma.articleVersion.create({
    data: {
      articleId: params.articleId,
      editorId: params.editorId,
      versionNumber,
      status: params.status,
      title: params.title,
      snapshot: params.snapshot,
      changeSummary: params.changeSummary,
    },
  });
}

export async function createArticleAction(raw: ArticleFormInput): Promise<ActionResult<{ id: string; slug: string }>> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_WRITE);

  const parsed = articleInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const input = parsed.data;

  const slug = await ensureUniqueSlug(input.slug || input.title);
  const blocks = joinPakistanImpact(input.blocks, input.pakistanImpact);

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
      createdById: user.id,
      locationName: nullable(input.locationName),
      featuredImageUrl: nullable(input.featuredImageUrl),
      featuredImageAlt: nullable(input.featuredImageAlt),
      featuredImageCaption: nullable(input.featuredImageCaption),
      featuredImageCredit: nullable(input.featuredImageCredit),
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
    snapshot: buildSnapshot(input, blocks),
    changeSummary: "Created",
  });
  await logAction({ userId: user.id, action: "article_created", entityType: "Article", entityId: article.id });

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

  const slug =
    slugify(input.slug) === existing.slug ? existing.slug : await ensureUniqueSlug(input.slug, articleId);
  const blocks = joinPakistanImpact(input.blocks, input.pakistanImpact);

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
      locationName: nullable(input.locationName),
      featuredImageUrl: nullable(input.featuredImageUrl),
      featuredImageAlt: nullable(input.featuredImageAlt),
      featuredImageCaption: nullable(input.featuredImageCaption),
      featuredImageCredit: nullable(input.featuredImageCredit),
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
    snapshot: buildSnapshot(input, blocks),
    changeSummary: "Edited",
  });
  await logAction({ userId: user.id, action: "article_edited", entityType: "Article", entityId: article.id });

  return { ok: true, data: { slug: article.slug } };
}

export async function transitionArticleAction(articleId: string, name: TransitionName): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) throw new ForbiddenError("You must be signed in.");

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { tags: { include: { tag: true } } },
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
      slugAvailable,
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

  return { ok: true };
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
