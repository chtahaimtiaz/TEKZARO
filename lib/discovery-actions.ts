"use server";

import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_RESEARCH, CAN_CREATE_DRAFT_FROM_DISCOVERY } from "./permissions";
import { logAction } from "./audit";
import { hasUnresolvedContradiction } from "./cluster-actions";
import { featuredImageFieldsFor } from "./images/featured-image";
import type { Prisma } from "@prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Marks an item as actively being researched — the first touch on a NEW item. */
export async function researchItemAction(itemId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);

  const item = await prisma.sourceItem.findUniqueOrThrow({ where: { id: itemId } });
  if (item.status === "NEW") {
    await prisma.sourceItem.update({
      where: { id: itemId },
      data: { status: "REVIEWING", reviewedById: user.id },
    });
    await logAction({ userId: user.id, action: "discovery_research", entityType: "SourceItem", entityId: itemId });
  }
  redirect(`/admin/discovery/${itemId}`);
}

export async function saveReviewNoteAction(itemId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);
  const note = String(formData.get("reviewNote") ?? "").trim();

  const item = await prisma.sourceItem.findUniqueOrThrow({ where: { id: itemId } });
  await prisma.sourceItem.update({
    where: { id: itemId },
    data: {
      reviewNote: note || null,
      reviewedById: user.id,
      status: item.status === "NEW" ? "REVIEWING" : item.status,
    },
  });
  await logAction({ userId: user.id, action: "discovery_saved", entityType: "SourceItem", entityId: itemId });
  redirect(`/admin/discovery/${itemId}`);
}

export async function setDiscoveryStatusAction(itemId: string, status: "VERIFIED" | "REJECTED"): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);

  await prisma.sourceItem.update({
    where: { id: itemId },
    data: { status, reviewedById: user.id },
  });
  await logAction({
    userId: user.id,
    action: status === "VERIFIED" ? "discovery_verified" : "discovery_rejected",
    entityType: "SourceItem",
    entityId: itemId,
  });
  redirect(`/admin/discovery/${itemId}`);
}

/** Creates a DRAFT article pre-filled from a discovery item, linked back via
 * ArticleSource, and flips the item to CONVERTED_TO_DRAFT. Blocked if the
 * item's cluster has an unresolved contradiction — an editor must resolve
 * it first rather than the system silently picking a side. */
export async function createDraftFromItemAction(itemId: string): Promise<ActionResult & { articleId?: string }> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_CREATE_DRAFT_FROM_DISCOVERY);

  const item = await prisma.sourceItem.findUnique({
    where: { id: itemId },
    include: { source: true, category: true },
  });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status === "CONVERTED_TO_DRAFT" && item.convertedArticleId) {
    return { ok: true, articleId: item.convertedArticleId };
  }

  if (item.clusterId && (await hasUnresolvedContradiction(item.clusterId))) {
    return {
      ok: false,
      error: "This story has an unresolved contradiction between sources — resolve it on the cluster page before drafting.",
    };
  }

  const defaultAuthor = await prisma.author.findFirst({ orderBy: { name: "asc" } });
  if (!defaultAuthor) return { ok: false, error: "No author profiles exist yet — create one first." };
  const category = item.category ?? (await prisma.category.findFirst({ orderBy: { name: "asc" } }));
  if (!category) return { ok: false, error: "No categories exist yet." };

  const blocks = [
    { type: "paragraph", text: item.excerpt || item.headline },
    { type: "heading", level: 2, text: "What Happened" },
    { type: "paragraph", text: "" },
    { type: "heading", level: 2, text: "Why It Matters" },
    { type: "paragraph", text: "" },
  ];

  const baseSlug = item.headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  let slug = baseSlug || "draft";
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (await prisma.article.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${baseSlug}-${n}`;
  }

  const article = await prisma.article.create({
    data: {
      slug,
      title: item.headline,
      excerpt: item.excerpt,
      content: { blocks } as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
      categoryId: category.id,
      authorId: defaultAuthor.id,
      createdById: user.id,
      metaDescription: item.excerpt,
      pakistanRelevance: item.pakistanRelevance,
      ...(await featuredImageFieldsFor(item.id)),
    },
  });

  await prisma.articleSource.create({
    data: { articleId: article.id, sourceId: item.sourceId },
  });
  await prisma.sourceItem.update({
    where: { id: itemId },
    data: { status: "CONVERTED_TO_DRAFT", convertedArticleId: article.id, reviewedById: user.id },
  });

  await logAction({
    userId: user.id,
    action: "discovery_converted_to_draft",
    entityType: "SourceItem",
    entityId: itemId,
    metadata: { articleId: article.id },
  });

  return { ok: true, articleId: article.id };
}

export async function mergeIntoClusterAction(itemId: string, targetClusterId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);

  await prisma.sourceItem.update({ where: { id: itemId }, data: { clusterId: targetClusterId } });
  await logAction({
    userId: user.id,
    action: "discovery_merged",
    entityType: "SourceItem",
    entityId: itemId,
    metadata: { targetClusterId },
  });
  redirect(`/admin/discovery/clusters/${targetClusterId}`);
}
