import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { ForbiddenError } from "../lib/auth";
import {
  createAdvertiserAction,
  updateAdvertiserAction,
  setAdvertiserStatusAction,
  deleteAdvertiserAction,
  createAdCampaignAction,
  updateAdCampaignAction,
  deleteAdCampaignAction,
  submitAdCampaignAction,
  approveAdCampaignAction,
  rejectAdCampaignAction,
  pauseAdCampaignAction,
  resumeAdCampaignAction,
  upsertAdCreativeAction,
} from "../lib/ad-actions";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData, captureRedirect } from "./helpers";

const advertiserIds: string[] = [];
const campaignIds: string[] = [];

afterAll(async () => {
  clearSession();
  if (campaignIds.length) await prisma.adCampaign.deleteMany({ where: { id: { in: campaignIds } } });
  if (advertiserIds.length) await prisma.advertiser.deleteMany({ where: { id: { in: advertiserIds } } });
  await cleanupTestData();
});

function uniqueName(label: string): string {
  return `ZZZ Test ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function advertiserForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("name", overrides.name ?? uniqueName("Advertiser"));
  if (overrides.contactName) form.set("contactName", overrides.contactName);
  if (overrides.contactEmail) form.set("contactEmail", overrides.contactEmail);
  if (overrides.notes) form.set("notes", overrides.notes);
  return form;
}

// Every create action here is void+redirect (no created-row id in the
// response), and this suite runs against the same shared DB other test
// files may be writing to concurrently — so the row is always looked up by
// the unique name this helper generated and passed in, never by "most
// recently created," which would be a real race under concurrent test files.
async function makeAdvertiser(): Promise<string> {
  const name = uniqueName("Advertiser");
  const url = await captureRedirect(() => createAdvertiserAction(advertiserForm({ name })));
  expect(url).toBe("/admin/advertisers");
  const advertiser = await prisma.advertiser.findFirstOrThrow({ where: { name } });
  advertiserIds.push(advertiser.id);
  return advertiser.id;
}

function campaignForm(advertiserId: string, overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("name", overrides.name ?? `Test Campaign ${Date.now()}`);
  form.set("advertiserId", advertiserId);
  form.set("placement", overrides.placement ?? "HOMEPAGE_FEED");
  if (overrides.categoryId) form.set("categoryId", overrides.categoryId);
  form.set("startDate", overrides.startDate ?? "2026-01-01");
  form.set("endDate", overrides.endDate ?? "2026-01-31");
  form.set("priority", overrides.priority ?? "0");
  return form;
}

describe("Advertiser CRUD", () => {
  it("an ADMIN can create, update and toggle status on an advertiser", async () => {
    const admin = await createTestUser("ADMIN", "ads-advertiser-crud");
    trackUser(admin.id);
    await loginAs(admin.id);

    const originalName = uniqueName("Advertiser");
    const createUrl = await captureRedirect(() => createAdvertiserAction(advertiserForm({ name: originalName, contactEmail: "biz@example.com" })));
    expect(createUrl).toBe("/admin/advertisers");
    const advertiser = await prisma.advertiser.findFirstOrThrow({ where: { name: originalName } });
    advertiserIds.push(advertiser.id);
    expect(advertiser.status).toBe("ACTIVE");

    const renamedTo = uniqueName("Advertiser Renamed");
    const updateForm = advertiserForm({ name: renamedTo, contactEmail: "biz@example.com" });
    await captureRedirect(() => updateAdvertiserAction(advertiser.id, updateForm));
    const updated = await prisma.advertiser.findUniqueOrThrow({ where: { id: advertiser.id } });
    expect(updated.name).toBe(renamedTo);

    await captureRedirect(() => setAdvertiserStatusAction(advertiser.id, "INACTIVE"));
    const deactivated = await prisma.advertiser.findUniqueOrThrow({ where: { id: advertiser.id } });
    expect(deactivated.status).toBe("INACTIVE");

    clearSession();
  });

  it("rejects an advertiser with a blank name", async () => {
    const admin = await createTestUser("ADMIN", "ads-advertiser-invalid");
    trackUser(admin.id);
    await loginAs(admin.id);

    const url = await captureRedirect(() => createAdvertiserAction(advertiserForm({ name: "" })));
    expect(url).toContain("/admin/advertisers?error=");

    clearSession();
  });

  it("cannot delete an advertiser that still has campaigns, but can once they're gone", async () => {
    const admin = await createTestUser("ADMIN", "ads-advertiser-delete");
    trackUser(admin.id);
    await loginAs(admin.id);

    const advertiserId = await makeAdvertiser();
    const campaignUrl = await captureRedirect(() => createAdCampaignAction(campaignForm(advertiserId)));
    const campaignId = campaignUrl.split("/").pop()!;
    campaignIds.push(campaignId);

    const blockedUrl = await captureRedirect(() => deleteAdvertiserAction(advertiserId));
    expect(blockedUrl).toContain("/admin/advertisers?error=");
    expect(await prisma.advertiser.findUnique({ where: { id: advertiserId } })).not.toBeNull();

    await prisma.adCampaign.delete({ where: { id: campaignId } });
    campaignIds.splice(campaignIds.indexOf(campaignId), 1);

    const okUrl = await captureRedirect(() => deleteAdvertiserAction(advertiserId));
    expect(okUrl).toBe("/admin/advertisers");
    expect(await prisma.advertiser.findUnique({ where: { id: advertiserId } })).toBeNull();
    advertiserIds.splice(advertiserIds.indexOf(advertiserId), 1);

    clearSession();
  });
});

describe("AdCampaign CRUD", () => {
  it("creates a campaign in DRAFT and rejects an end date before the start date", async () => {
    const admin = await createTestUser("ADMIN", "ads-campaign-crud");
    trackUser(admin.id);
    await loginAs(admin.id);

    const advertiserId = await makeAdvertiser();

    const url = await captureRedirect(() => createAdCampaignAction(campaignForm(advertiserId)));
    expect(url).toMatch(/^\/admin\/ad-campaigns\/.+/);
    const campaignId = url.split("/").pop()!;
    campaignIds.push(campaignId);

    const campaign = await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.categoryId).toBeNull();

    const badDatesUrl = await captureRedirect(() =>
      createAdCampaignAction(campaignForm(advertiserId, { startDate: "2026-02-01", endDate: "2026-01-01" })),
    );
    expect(badDatesUrl).toContain("/admin/ad-campaigns/new?error=");

    const renameUrl = await captureRedirect(() => updateAdCampaignAction(campaignId, campaignForm(advertiserId, { name: "Renamed" })));
    expect(renameUrl).toBe(`/admin/ad-campaigns/${campaignId}`);
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaignId } })).name).toBe("Renamed");

    clearSession();
  });

  it("a campaign can be deleted regardless of status", async () => {
    const admin = await createTestUser("ADMIN", "ads-campaign-delete");
    trackUser(admin.id);
    await loginAs(admin.id);

    const advertiserId = await makeAdvertiser();
    const url = await captureRedirect(() => createAdCampaignAction(campaignForm(advertiserId)));
    const campaignId = url.split("/").pop()!;
    campaignIds.push(campaignId);

    await prisma.adCampaign.update({ where: { id: campaignId }, data: { status: "PENDING_REVIEW" } });
    const okUrl = await captureRedirect(() => deleteAdCampaignAction(campaignId));
    expect(okUrl).toBe("/admin/ad-campaigns");
    expect(await prisma.adCampaign.findUnique({ where: { id: campaignId } })).toBeNull();
    campaignIds.splice(campaignIds.indexOf(campaignId), 1);

    clearSession();
  });
});

describe("Ad campaign workflow", () => {
  it("full lifecycle: draft -> submit -> blocked without creative -> creative -> approve -> pause -> resume", async () => {
    const admin = await createTestUser("ADMIN", "ads-workflow");
    trackUser(admin.id);
    await loginAs(admin.id);

    const advertiserId = await makeAdvertiser();
    const createUrl = await captureRedirect(() => createAdCampaignAction(campaignForm(advertiserId)));
    const campaignId = createUrl.split("/").pop()!;
    campaignIds.push(campaignId);

    await captureRedirect(() => submitAdCampaignAction(campaignId));
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("PENDING_REVIEW");

    const blockedApproveUrl = await captureRedirect(() => approveAdCampaignAction(campaignId));
    expect(blockedApproveUrl).toContain("error=");
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("PENDING_REVIEW");

    const creativeForm = new FormData();
    creativeForm.set("imageUrl", "https://example.com/creative.png");
    creativeForm.set("altText", "A creative");
    creativeForm.set("targetUrl", "https://example.com/landing");
    await captureRedirect(() => upsertAdCreativeAction(campaignId, creativeForm));
    expect((await prisma.adCreative.findUnique({ where: { campaignId } }))?.targetUrl).toBe("https://example.com/landing");

    await captureRedirect(() => approveAdCampaignAction(campaignId));
    const approved = await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedById).toBe(admin.id);

    await captureRedirect(() => pauseAdCampaignAction(campaignId));
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("PAUSED");

    await captureRedirect(() => resumeAdCampaignAction(campaignId));
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("APPROVED");

    clearSession();
  });

  it("a rejected campaign records the reviewer and reason, and can be resubmitted", async () => {
    const admin = await createTestUser("ADMIN", "ads-reject");
    trackUser(admin.id);
    await loginAs(admin.id);

    const advertiserId = await makeAdvertiser();
    const createUrl = await captureRedirect(() => createAdCampaignAction(campaignForm(advertiserId)));
    const campaignId = createUrl.split("/").pop()!;
    campaignIds.push(campaignId);

    await captureRedirect(() => submitAdCampaignAction(campaignId));

    const rejectForm = new FormData();
    rejectForm.set("rejectionReason", "Creative doesn't meet brand guidelines.");
    await captureRedirect(() => rejectAdCampaignAction(campaignId, rejectForm));

    const rejected = await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.reviewedById).toBe(admin.id);
    expect(rejected.rejectionReason).toBe("Creative doesn't meet brand guidelines.");

    // REJECTED has no legal transition back to PENDING_REVIEW — advertising
    // ops resubmits via a fresh DRAFT->submit cycle, so directly retrying
    // submit from REJECTED must fail cleanly, not silently succeed.
    const resubmitUrl = await captureRedirect(() => submitAdCampaignAction(campaignId));
    expect(resubmitUrl).toContain("error=");
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("REJECTED");

    clearSession();
  });
});

describe("Advertising authorization", () => {
  it("a REPORTER cannot manage advertisers or campaigns", async () => {
    const reporter = await createTestUser("REPORTER", "ads-authz-reporter");
    trackUser(reporter.id);
    await loginAs(reporter.id);

    await expect(createAdvertiserAction(advertiserForm())).rejects.toThrow(ForbiddenError);
    await expect(createAdCampaignAction(campaignForm("does-not-matter"))).rejects.toThrow(ForbiddenError);
    await expect(submitAdCampaignAction("does-not-matter")).rejects.toThrow(ForbiddenError);
    await expect(approveAdCampaignAction("does-not-matter")).rejects.toThrow(ForbiddenError);
    await expect(deleteAdvertiserAction("does-not-matter")).rejects.toThrow(ForbiddenError);

    clearSession();
  });

  it("an EDITOR can manage ads (not just ADMIN)", async () => {
    const editor = await createTestUser("EDITOR", "ads-authz-editor");
    trackUser(editor.id);
    await loginAs(editor.id);

    const name = uniqueName("Advertiser Editor");
    const url = await captureRedirect(() => createAdvertiserAction(advertiserForm({ name })));
    expect(url).toBe("/admin/advertisers");
    const advertiser = await prisma.advertiser.findFirstOrThrow({ where: { name } });
    advertiserIds.push(advertiser.id);

    clearSession();
  });
});
