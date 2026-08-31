"use server";

import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_RESEARCH, CAN_CREATE_DRAFT_FROM_DISCOVERY } from "./permissions";
import { logAction } from "./audit";
import { featuredImageFieldsFor } from "./images/featured-image";
import type { ClaimType, ClaimStance, Prisma } from "@prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
  articleId?: string;
}

/** True when any claim in the cluster has both a SUPPORTING and a
 * CONTRADICTING source and hasn't been explicitly resolved by an editor —
 * this is what blocks draft creation, server-side, unconditionally. */
export async function hasUnresolvedContradiction(clusterId: string): Promise<boolean> {
  const unresolved = await prisma.claim.findFirst({
    where: { clusterId, resolved: false },
  });
  return Boolean(unresolved);
}

export async function addResearchNoteAction(clusterId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  requireRole(sessionUser, CAN_RESEARCH);
  const note = String(formData.get("note") ?? "").trim();
  if (note) {
    await prisma.researchNote.create({ data: { clusterId, note } });
  }
  redirect(`/admin/discovery/clusters/${clusterId}`);
}

export async function createClaimAction(clusterId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);
  const text = String(formData.get("text") ?? "").trim();
  const type = String(formData.get("type") ?? "CLAIM") as ClaimType;
  if (text) {
    await prisma.claim.create({ data: { clusterId, text, type, createdById: user.id } });
    await logAction({ userId: user.id, action: "claim_created", entityType: "StoryCluster", entityId: clusterId });
  }
  redirect(`/admin/discovery/clusters/${clusterId}`);
}

export async function addClaimSourceAction(clusterId: string, claimId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);
  const sourceItemId = String(formData.get("sourceItemId") ?? "");
  const stance = String(formData.get("stance") ?? "SUPPORTING") as ClaimStance;
  if (!sourceItemId) redirect(`/admin/discovery/clusters/${clusterId}`);

  await prisma.claimSource.upsert({
    where: { claimId_sourceItemId: { claimId, sourceItemId } },
    update: { stance },
    create: { claimId, sourceItemId, stance },
  });

  const stances = await prisma.claimSource.findMany({ where: { claimId }, select: { stance: true } });
  const hasSupporting = stances.some((s) => s.stance === "SUPPORTING");
  const hasContradicting = stances.some((s) => s.stance === "CONTRADICTING");
  if (hasSupporting && hasContradicting) {
    await prisma.claim.update({ where: { id: claimId }, data: { resolved: false } });
  }

  await logAction({
    userId: user.id,
    action: "claim_source_added",
    entityType: "Claim",
    entityId: claimId,
    metadata: { sourceItemId, stance },
  });
  redirect(`/admin/discovery/clusters/${clusterId}`);
}

export async function resolveClaimAction(clusterId: string, claimId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);
  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim();

  await prisma.claim.update({
    where: { id: claimId },
    data: { resolved: true, resolutionNote: resolutionNote || null },
  });
  await logAction({ userId: user.id, action: "claim_resolved", entityType: "Claim", entityId: claimId });
  redirect(`/admin/discovery/clusters/${clusterId}`);
}

/** Detaches an item into its own new cluster rather than leaving it
 * clusterless — every discovery item always belongs to exactly one
 * cluster (a "cluster of one" is the degenerate case). */
export async function removeItemFromClusterAction(clusterId: string, itemId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);

  const item = await prisma.sourceItem.findUniqueOrThrow({ where: { id: itemId } });
  const newCluster = await prisma.storyCluster.create({
    data: {
      title: item.headline,
      pakistanRelevance: item.pakistanRelevance,
      pakistanImpactLevel: item.pakistanImpactLevel,
    },
  });
  await prisma.sourceItem.update({ where: { id: itemId }, data: { clusterId: newCluster.id } });
  await logAction({
    userId: user.id,
    action: "discovery_removed_from_cluster",
    entityType: "SourceItem",
    entityId: itemId,
    metadata: { fromClusterId: clusterId, newClusterId: newCluster.id },
  });
  redirect(`/admin/discovery/clusters/${clusterId}`);
}

export async function createDraftFromClusterAction(clusterId: string): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_CREATE_DRAFT_FROM_DISCOVERY);

  if (await hasUnresolvedContradiction(clusterId)) {
    return {
      ok: false,
      error: "This cluster has an unresolved contradiction between sources — resolve it below before drafting.",
    };
  }

  const items = await prisma.sourceItem.findMany({
    where: { clusterId },
    orderBy: { priorityScore: "desc" },
    include: { category: true, source: true },
  });
  if (items.length === 0) return { ok: false, error: "This cluster has no items." };
  const lead = items[0];

  if (lead.convertedArticleId) return { ok: true, articleId: lead.convertedArticleId };

  const claims = await prisma.claim.findMany({ where: { clusterId }, orderBy: { createdAt: "asc" } });
  const defaultAuthor = await prisma.author.findFirst({ orderBy: { name: "asc" } });
  if (!defaultAuthor) return { ok: false, error: "No author profiles exist yet — create one first." };
  const category = lead.category ?? (await prisma.category.findFirst({ orderBy: { name: "asc" } }));
  if (!category) return { ok: false, error: "No categories exist yet." };

  const sourceList = items.map((i) => `${i.source.name}: ${i.headline}`).join("; ");
  const blocks: Prisma.InputJsonValue = {
    blocks: [
      { type: "paragraph", text: lead.excerpt || lead.headline },
      { type: "heading", level: 2, text: "What Happened" },
      { type: "paragraph", text: "" },
      ...(claims.length
        ? [
            { type: "heading", level: 2, text: "Key Claims" },
            {
              type: "list",
              style: "bullet",
              items: claims.map((c) => `[${c.type}] ${c.text}`),
            },
          ]
        : []),
      { type: "heading", level: 2, text: "Why It Matters" },
      { type: "paragraph", text: "" },
      { type: "heading", level: 2, text: "Sources" },
      { type: "paragraph", text: sourceList },
    ],
  } as unknown as Prisma.InputJsonValue;

  const baseSlug = lead.headline
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
      title: lead.headline,
      excerpt: lead.excerpt,
      content: blocks,
      status: "DRAFT",
      categoryId: category.id,
      authorId: defaultAuthor.id,
      createdById: user.id,
      metaDescription: lead.excerpt,
      pakistanRelevance: lead.pakistanRelevance,
      ...(await featuredImageFieldsFor(lead.id)),
    },
  });

  await prisma.articleSource.createMany({
    data: [...new Set(items.map((i) => i.sourceId))].map((sourceId) => ({ articleId: article.id, sourceId })),
    skipDuplicates: true,
  });
  await prisma.sourceItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { status: "CONVERTED_TO_DRAFT", convertedArticleId: article.id, reviewedById: user.id },
  });

  await logAction({
    userId: user.id,
    action: "cluster_converted_to_draft",
    entityType: "StoryCluster",
    entityId: clusterId,
    metadata: { articleId: article.id, itemCount: items.length },
  });

  return { ok: true, articleId: article.id };
}
