"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_ADS } from "./permissions";
import { logAction } from "./audit";
import { assertAdTransition, AdWorkflowError, type AdTransitionName } from "./ad-workflow";
import type { AdPlacement } from "@prisma/client";

const AD_PLACEMENTS: AdPlacement[] = ["HOMEPAGE_FEED", "CATEGORY_TOP", "ARTICLE_END"];

function nullable(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Advertiser
// ---------------------------------------------------------------------------

const advertiserSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  contactName: z.string().trim().optional(),
  contactEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
  notes: z.string().trim().optional(),
});

export async function createAdvertiserAction(formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_ADS);

  const parsed = advertiserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/advertisers?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }

  const advertiser = await prisma.advertiser.create({
    data: {
      name: parsed.data.name,
      contactName: nullable(parsed.data.contactName),
      contactEmail: nullable(parsed.data.contactEmail),
      notes: nullable(parsed.data.notes),
    },
  });
  await logAction({ userId: user.id, action: "advertiser_created", entityType: "Advertiser", entityId: advertiser.id });
  redirect("/admin/advertisers");
}

export async function updateAdvertiserAction(advertiserId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_ADS);

  const parsed = advertiserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/advertisers/${advertiserId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }

  await prisma.advertiser.update({
    where: { id: advertiserId },
    data: {
      name: parsed.data.name,
      contactName: nullable(parsed.data.contactName),
      contactEmail: nullable(parsed.data.contactEmail),
      notes: nullable(parsed.data.notes),
    },
  });
  await logAction({ userId: user.id, action: "advertiser_updated", entityType: "Advertiser", entityId: advertiserId });
  redirect(`/admin/advertisers/${advertiserId}`);
}

export async function setAdvertiserStatusAction(advertiserId: string, status: "ACTIVE" | "INACTIVE"): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_ADS);

  await prisma.advertiser.update({ where: { id: advertiserId }, data: { status } });
  await logAction({
    userId: user.id,
    action: status === "ACTIVE" ? "advertiser_activated" : "advertiser_deactivated",
    entityType: "Advertiser",
    entityId: advertiserId,
  });
  redirect(`/admin/advertisers/${advertiserId}`);
}

export async function deleteAdvertiserAction(advertiserId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_ADS);

  try {
    await prisma.advertiser.delete({ where: { id: advertiserId } });
    await logAction({ userId: user.id, action: "advertiser_deleted", entityType: "Advertiser", entityId: advertiserId });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2003" || code === "P2014") {
      redirect("/admin/advertisers?error=" + encodeURIComponent("This advertiser still has campaigns and can't be deleted."));
    }
    throw err;
  }
  redirect("/admin/advertisers");
}

// ---------------------------------------------------------------------------
// AdCampaign
// ---------------------------------------------------------------------------

const campaignSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  advertiserId: z.string().trim().min(1, "Choose an advertiser."),
  placement: z.enum(AD_PLACEMENTS as [AdPlacement, ...AdPlacement[]]),
  categoryId: z.string().trim().optional(),
  startDate: z.string().trim().min(1, "Start date is required."),
  endDate: z.string().trim().min(1, "End date is required."),
  priority: z.coerce.number().int().min(0).max(100).default(0),
});

function parseCampaignDates(startDate: string, endDate: string): { start: Date; end: Date } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date.");
  }
  if (end <= start) {
    throw new Error("End date must be after the start date.");
  }
  return { start, end };
}

export async function createAdCampaignAction(formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_ADS);

  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/ad-campaigns/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }

  let dates: { start: Date; end: Date };
  try {
    dates = parseCampaignDates(parsed.data.startDate, parsed.data.endDate);
  } catch (err) {
    redirect(`/admin/ad-campaigns/new?error=${encodeURIComponent(err instanceof Error ? err.message : "Invalid dates.")}`);
  }

  const campaign = await prisma.adCampaign.create({
    data: {
      name: parsed.data.name,
      advertiserId: parsed.data.advertiserId,
      placement: parsed.data.placement,
      categoryId: nullable(parsed.data.categoryId),
      startDate: dates.start,
      endDate: dates.end,
      priority: parsed.data.priority,
      createdById: user.id,
    },
  });
  await logAction({ userId: user.id, action: "ad_campaign_created", entityType: "AdCampaign", entityId: campaign.id });
  redirect(`/admin/ad-campaigns/${campaign.id}`);
}

export async function updateAdCampaignAction(campaignId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_ADS);

  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/ad-campaigns/${campaignId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }

  let dates: { start: Date; end: Date };
  try {
    dates = parseCampaignDates(parsed.data.startDate, parsed.data.endDate);
  } catch (err) {
    redirect(`/admin/ad-campaigns/${campaignId}?error=${encodeURIComponent(err instanceof Error ? err.message : "Invalid dates.")}`);
  }

  await prisma.adCampaign.update({
    where: { id: campaignId },
    data: {
      name: parsed.data.name,
      advertiserId: parsed.data.advertiserId,
      placement: parsed.data.placement,
      categoryId: nullable(parsed.data.categoryId),
      startDate: dates.start,
      endDate: dates.end,
      priority: parsed.data.priority,
    },
  });
  await logAction({ userId: user.id, action: "ad_campaign_updated", entityType: "AdCampaign", entityId: campaignId });
  redirect(`/admin/ad-campaigns/${campaignId}`);
}

export async function deleteAdCampaignAction(campaignId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_ADS);

  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) redirect("/admin/ad-campaigns");
  // Only a DRAFT — never reviewed, never delivered — can be hard-deleted.
  // Anything further along keeps a permanent record via reject/pause instead.
  if (campaign!.status !== "DRAFT") {
    redirect(`/admin/ad-campaigns/${campaignId}?error=${encodeURIComponent("Only a draft campaign can be deleted.")}`);
  }

  await prisma.adCampaign.delete({ where: { id: campaignId } });
  await logAction({ userId: user.id, action: "ad_campaign_deleted", entityType: "AdCampaign", entityId: campaignId, metadata: { name: campaign!.name } });
  redirect("/admin/ad-campaigns");
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

async function runAdTransition(name: AdTransitionName, campaignId: string, extra?: { rejectionReason?: string }): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_ADS);

  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) redirect("/admin/ad-campaigns");

  let to;
  try {
    to = assertAdTransition(name, campaign!, user);
  } catch (err) {
    const message = err instanceof AdWorkflowError ? err.message : "Cannot perform that action.";
    redirect(`/admin/ad-campaigns/${campaignId}?error=${encodeURIComponent(message)}`);
  }

  await prisma.adCampaign.update({
    where: { id: campaignId },
    data: {
      status: to!,
      ...(name === "approve" || name === "reject" ? { reviewedById: user.id } : {}),
      ...(name === "reject" ? { rejectionReason: extra?.rejectionReason ?? null } : {}),
      ...(name === "submit" ? { rejectionReason: null } : {}),
    },
  });
  await logAction({
    userId: user.id,
    action: `ad_campaign_${name}`,
    entityType: "AdCampaign",
    entityId: campaignId,
    metadata: extra?.rejectionReason ? { rejectionReason: extra.rejectionReason } : undefined,
  });
  redirect(`/admin/ad-campaigns/${campaignId}`);
}

export async function submitAdCampaignAction(campaignId: string): Promise<void> {
  await runAdTransition("submit", campaignId);
}

export async function approveAdCampaignAction(campaignId: string): Promise<void> {
  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId }, include: { creative: true } });
  if (campaign && !campaign.creative) {
    redirect(`/admin/ad-campaigns/${campaignId}?error=${encodeURIComponent("Upload a creative before approving this campaign.")}`);
  }
  await runAdTransition("approve", campaignId);
}

export async function rejectAdCampaignAction(campaignId: string, formData: FormData): Promise<void> {
  const reason = String(formData.get("rejectionReason") || "").trim();
  await runAdTransition("reject", campaignId, { rejectionReason: reason || undefined });
}

export async function pauseAdCampaignAction(campaignId: string): Promise<void> {
  await runAdTransition("pause", campaignId);
}

export async function resumeAdCampaignAction(campaignId: string): Promise<void> {
  await runAdTransition("resume", campaignId);
}

// ---------------------------------------------------------------------------
// Creative
// ---------------------------------------------------------------------------

const creativeSchema = z.object({
  imageUrl: z.string().trim().min(1, "Upload a creative image first."),
  altText: z.string().trim().min(1, "Alt text is required."),
  targetUrl: z.string().trim().url("Enter a valid destination URL."),
});

export async function upsertAdCreativeAction(campaignId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_ADS);

  const parsed = creativeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/ad-campaigns/${campaignId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }

  await prisma.adCreative.upsert({
    where: { campaignId },
    create: { campaignId, imageUrl: parsed.data.imageUrl, altText: parsed.data.altText, targetUrl: parsed.data.targetUrl },
    update: { imageUrl: parsed.data.imageUrl, altText: parsed.data.altText, targetUrl: parsed.data.targetUrl },
  });
  await logAction({ userId: user.id, action: "ad_creative_saved", entityType: "AdCampaign", entityId: campaignId });
  redirect(`/admin/ad-campaigns/${campaignId}`);
}
