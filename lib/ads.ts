import "server-only";
import { prisma } from "./prisma";
import type { AdCampaign, AdCampaignStatus, AdCreative, AdPlacement, Prisma } from "@prisma/client";

/** SCHEDULED/ACTIVE/EXPIRED are never stored — see the AdCampaignStatus
 * doc comment in schema.prisma. This is the only place that turns a stored
 * status + date range into what's actually true right now. */
export type AdRuntimeStatus = "DRAFT" | "PENDING_REVIEW" | "REJECTED" | "PAUSED" | "SCHEDULED" | "ACTIVE" | "EXPIRED";

export const AD_RUNTIME_STATUS_LABELS: Record<AdRuntimeStatus, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending review",
  REJECTED: "Rejected",
  PAUSED: "Paused",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  EXPIRED: "Expired",
};

export function computeAdRuntimeStatus(
  campaign: { status: AdCampaignStatus; startDate: Date; endDate: Date },
  now: Date = new Date(),
): AdRuntimeStatus {
  if (campaign.status !== "APPROVED") return campaign.status;
  if (now < campaign.startDate) return "SCHEDULED";
  if (now > campaign.endDate) return "EXPIRED";
  return "ACTIVE";
}

export function isAdDeliverable(runtimeStatus: AdRuntimeStatus): boolean {
  return runtimeStatus === "ACTIVE";
}

export interface AdCandidate {
  status: AdCampaignStatus;
  startDate: Date;
  endDate: Date;
  categoryId: string | null;
  priority: number;
}

/**
 * Pure: given a pool already narrowed by the caller's query to one
 * placement and eligible categories, picks the single campaign that should
 * deliver for `categoryId` right now. A campaign with categoryId=null is a
 * wildcard eligible for every category's slot (including the homepage's
 * category-less slot); a campaign with a categoryId is eligible only for
 * that exact category's slot. Among eligible + currently-deliverable
 * campaigns, an exact category match always beats a wildcard, then highest
 * `priority` wins, then remaining ties are rotated via `random` (injectable
 * for deterministic tests) rather than always picking the same one.
 */
export function resolveActiveCampaign<T extends AdCandidate>(
  candidates: T[],
  categoryId: string | null,
  now: Date = new Date(),
  random: () => number = Math.random,
): T | null {
  const eligible = candidates.filter((c) => c.categoryId === null || c.categoryId === categoryId);
  const deliverable = eligible.filter((c) => isAdDeliverable(computeAdRuntimeStatus(c, now)));
  if (deliverable.length === 0) return null;

  const specific = categoryId ? deliverable.filter((c) => c.categoryId === categoryId) : [];
  const tier = specific.length > 0 ? specific : deliverable.filter((c) => c.categoryId === null);

  const maxPriority = Math.max(...tier.map((c) => c.priority));
  const topTier = tier.filter((c) => c.priority === maxPriority);
  return topTier[Math.floor(random() * topTier.length)] ?? null;
}

export interface ResolvedAd {
  campaign: AdCampaign;
  creative: AdCreative;
}

/** The one function the public site calls to fill an ad slot. `categoryId`
 * is null for a slot with no category context (HOMEPAGE_FEED) — see
 * resolveActiveCampaign for exactly what that does and doesn't match. */
export async function getActiveAdForPlacement(placement: AdPlacement, categoryId: string | null): Promise<ResolvedAd | null> {
  const where: Prisma.AdCampaignWhereInput = {
    placement,
    status: "APPROVED",
    creative: { isNot: null },
    OR: categoryId ? [{ categoryId: null }, { categoryId }] : [{ categoryId: null }],
  };
  const candidates = await prisma.adCampaign.findMany({ where, include: { creative: true } });
  const winner = resolveActiveCampaign(candidates, categoryId);
  if (!winner || !winner.creative) return null;
  return { campaign: winner, creative: winner.creative };
}

export async function logAdImpression(campaignId: string, path: string): Promise<void> {
  await prisma.adImpression.create({ data: { campaignId, path } });
}

export async function logAdClick(campaignId: string, path: string): Promise<void> {
  await prisma.adClick.create({ data: { campaignId, path } });
}

export interface AdCampaignStats {
  impressions: number;
  clicks: number;
  ctr: number | null;
}

export async function getAdCampaignStats(campaignId: string): Promise<AdCampaignStats> {
  const [impressions, clicks] = await Promise.all([
    prisma.adImpression.count({ where: { campaignId } }),
    prisma.adClick.count({ where: { campaignId } }),
  ]);
  return { impressions, clicks, ctr: impressions > 0 ? clicks / impressions : null };
}
