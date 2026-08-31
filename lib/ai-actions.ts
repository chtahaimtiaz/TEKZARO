"use server";

import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_RESEARCH } from "./permissions";
import { suggestPakistanImpactNarrative, summarizeClaims, extractClaims, type AITaskResult } from "./ai/tasks";

export async function suggestPakistanImpactAction(sourceItemId: string): Promise<AITaskResult> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);

  const item = await prisma.sourceItem.findUniqueOrThrow({ where: { id: sourceItemId } });
  const reasons = (item.pakistanImpactReasons as unknown as string[] | null) ?? [];

  return suggestPakistanImpactNarrative({
    requestedById: user.id,
    sourceItemId,
    headline: item.headline,
    excerpt: item.excerpt ?? "",
    matchedReasons: reasons,
  });
}

export async function summarizeClusterAction(clusterId: string): Promise<AITaskResult> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);

  const items = await prisma.sourceItem.findMany({ where: { clusterId }, include: { source: true } });
  return summarizeClaims({
    requestedById: user.id,
    clusterId,
    sourceTexts: items.map((i) => ({ sourceName: i.source.name, text: `${i.headline}\n${i.excerpt ?? ""}` })),
  });
}

export async function extractClaimsAction(clusterId: string): Promise<AITaskResult> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_RESEARCH);

  const items = await prisma.sourceItem.findMany({ where: { clusterId }, include: { source: true } });
  return extractClaims({
    requestedById: user.id,
    clusterId,
    sourceTexts: items.map((i) => ({ sourceName: i.source.name, text: `${i.headline}\n${i.excerpt ?? ""}` })),
  });
}
