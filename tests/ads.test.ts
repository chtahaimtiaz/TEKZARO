import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import {
  computeAdRuntimeStatus,
  resolveActiveCampaign,
  getActiveAdForPlacement,
  getAdCampaignStats,
  logAdImpression,
  logAdClick,
  type AdCandidate,
} from "../lib/ads";
import { createTestUser, trackUser, cleanupTestData } from "./helpers";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-06-15T12:00:00Z");

function candidate(overrides: Partial<AdCandidate> = {}): AdCandidate {
  return {
    status: "APPROVED",
    startDate: new Date(now.getTime() - HOUR),
    endDate: new Date(now.getTime() + HOUR),
    categoryId: null,
    priority: 0,
    ...overrides,
  };
}

describe("computeAdRuntimeStatus — pure", () => {
  it("passes through the stored status unless it's APPROVED", () => {
    expect(computeAdRuntimeStatus(candidate({ status: "DRAFT" }), now)).toBe("DRAFT");
    expect(computeAdRuntimeStatus(candidate({ status: "PENDING_REVIEW" }), now)).toBe("PENDING_REVIEW");
    expect(computeAdRuntimeStatus(candidate({ status: "REJECTED" }), now)).toBe("REJECTED");
    expect(computeAdRuntimeStatus(candidate({ status: "PAUSED" }), now)).toBe("PAUSED");
  });

  it("an APPROVED campaign before its start date is SCHEDULED", () => {
    const c = candidate({ startDate: new Date(now.getTime() + HOUR), endDate: new Date(now.getTime() + 2 * HOUR) });
    expect(computeAdRuntimeStatus(c, now)).toBe("SCHEDULED");
  });

  it("an APPROVED campaign within its date range is ACTIVE", () => {
    expect(computeAdRuntimeStatus(candidate(), now)).toBe("ACTIVE");
  });

  it("an APPROVED campaign past its end date is EXPIRED", () => {
    const c = candidate({ startDate: new Date(now.getTime() - 2 * HOUR), endDate: new Date(now.getTime() - HOUR) });
    expect(computeAdRuntimeStatus(c, now)).toBe("EXPIRED");
  });

  it("boundary: exactly at startDate/endDate counts as ACTIVE (inclusive range)", () => {
    const atStart = candidate({ startDate: now, endDate: new Date(now.getTime() + HOUR) });
    const atEnd = candidate({ startDate: new Date(now.getTime() - HOUR), endDate: now });
    expect(computeAdRuntimeStatus(atStart, now)).toBe("ACTIVE");
    expect(computeAdRuntimeStatus(atEnd, now)).toBe("ACTIVE");
  });
});

describe("resolveActiveCampaign — pure", () => {
  it("returns null when nothing is deliverable", () => {
    expect(resolveActiveCampaign([candidate({ status: "DRAFT" }), candidate({ status: "PAUSED" })], null, now)).toBeNull();
  });

  it("excludes a campaign scoped to a different category", () => {
    const other = candidate({ categoryId: "other-cat" });
    expect(resolveActiveCampaign([other], "this-cat", now)).toBeNull();
  });

  it("a wildcard (categoryId=null) campaign matches every category, including the category-less homepage slot", () => {
    const wildcard = candidate({ categoryId: null });
    expect(resolveActiveCampaign([wildcard], "ai-cat", now)).toBe(wildcard);
    expect(resolveActiveCampaign([wildcard], null, now)).toBe(wildcard);
  });

  it("a category-specific campaign never matches the category-less slot", () => {
    const specific = candidate({ categoryId: "ai-cat" });
    expect(resolveActiveCampaign([specific], null, now)).toBeNull();
  });

  it("prefers an exact category match over a wildcard, regardless of priority", () => {
    const wildcard = candidate({ categoryId: null, priority: 50 });
    const specific = candidate({ categoryId: "ai-cat", priority: 0 });
    expect(resolveActiveCampaign([wildcard, specific], "ai-cat", now)).toBe(specific);
  });

  it("within the same tier, higher priority wins", () => {
    const low = candidate({ priority: 1 });
    const high = candidate({ priority: 5 });
    expect(resolveActiveCampaign([low, high], null, now)).toBe(high);
  });

  it("ties are broken via the injected random function, not always the first candidate", () => {
    const a = candidate({ priority: 3 });
    const b = candidate({ priority: 3 });
    expect(resolveActiveCampaign([a, b], null, now, () => 0)).toBe(a);
    expect(resolveActiveCampaign([a, b], null, now, () => 0.99)).toBe(b);
  });

  it("a deliverable campaign for a different category never blocks the wildcard fallback", () => {
    const specificOther = candidate({ categoryId: "other-cat" });
    const wildcard = candidate({ categoryId: null });
    expect(resolveActiveCampaign([specificOther, wildcard], "ai-cat", now)).toBe(wildcard);
  });
});

describe("getActiveAdForPlacement / getAdCampaignStats — DB integration", () => {
  const advertiserIds: string[] = [];
  const campaignIds: string[] = [];
  const categoryIds: string[] = [];

  afterAll(async () => {
    if (campaignIds.length) await prisma.adCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    if (advertiserIds.length) await prisma.advertiser.deleteMany({ where: { id: { in: advertiserIds } } });
    if (categoryIds.length) await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await cleanupTestData();
  });

  it("resolves the approved, in-range, creative-having campaign for a placement and logs an impression", async () => {
    const admin = await createTestUser("ADMIN", "ads-resolve");
    trackUser(admin.id);

    const advertiser = await prisma.advertiser.create({ data: { name: `ZZZ Ads Test Advertiser ${Date.now()}` } });
    advertiserIds.push(advertiser.id);

    const campaign = await prisma.adCampaign.create({
      data: {
        name: "Homepage banner",
        advertiserId: advertiser.id,
        status: "APPROVED",
        placement: "HOMEPAGE_FEED",
        // Max priority so this test wins tie-breaking against any other
        // real HOMEPAGE_FEED campaign that might exist on this shared DB —
        // this suite doesn't own the whole table the way a dedicated
        // Category/Author fixture would.
        priority: 100,
        startDate: new Date(Date.now() - HOUR),
        endDate: new Date(Date.now() + HOUR),
        createdById: admin.id,
        creative: { create: { imageUrl: "https://example.com/ad.png", altText: "Ad", targetUrl: "https://example.com" } },
      },
    });
    campaignIds.push(campaign.id);

    const resolved = await getActiveAdForPlacement("HOMEPAGE_FEED", null);
    expect(resolved?.campaign.id).toBe(campaign.id);
    expect(resolved?.creative.targetUrl).toBe("https://example.com");

    await logAdImpression(campaign.id, "/");
    await logAdImpression(campaign.id, "/");
    await logAdClick(campaign.id, "/");

    const stats = await getAdCampaignStats(campaign.id);
    expect(stats.impressions).toBe(2);
    expect(stats.clicks).toBe(1);
    expect(stats.ctr).toBe(0.5);
  });

  it("never resolves a DRAFT/PENDING_REVIEW campaign even if its date range is current", async () => {
    const admin = await createTestUser("ADMIN", "ads-draft-not-resolved");
    trackUser(admin.id);

    const advertiser = await prisma.advertiser.create({ data: { name: `ZZZ Ads Draft Advertiser ${Date.now()}` } });
    advertiserIds.push(advertiser.id);

    const draft = await prisma.adCampaign.create({
      data: {
        name: "Unreviewed banner",
        advertiserId: advertiser.id,
        status: "DRAFT",
        placement: "ARTICLE_END",
        startDate: new Date(Date.now() - HOUR),
        endDate: new Date(Date.now() + HOUR),
        createdById: admin.id,
        creative: { create: { imageUrl: "https://example.com/ad2.png", altText: "Ad", targetUrl: "https://example.com" } },
      },
    });
    campaignIds.push(draft.id);

    const resolved = await getActiveAdForPlacement("ARTICLE_END", null);
    expect(resolved?.campaign.id).not.toBe(draft.id);
  });

  it("a campaign with no creative never resolves even when APPROVED and in range", async () => {
    const admin = await createTestUser("ADMIN", "ads-no-creative");
    trackUser(admin.id);

    const advertiser = await prisma.advertiser.create({ data: { name: `ZZZ Ads No Creative Advertiser ${Date.now()}` } });
    advertiserIds.push(advertiser.id);

    const category = await prisma.category.create({
      data: { name: `ZZZ Ads No Creative Cat ${Date.now()}`, slug: `zzz-ads-no-creative-cat-${Date.now()}` },
    });
    categoryIds.push(category.id);

    const noCreative = await prisma.adCampaign.create({
      data: {
        name: "No creative yet",
        advertiserId: advertiser.id,
        status: "APPROVED",
        placement: "CATEGORY_TOP",
        categoryId: category.id,
        startDate: new Date(Date.now() - HOUR),
        endDate: new Date(Date.now() + HOUR),
        createdById: admin.id,
      },
    });
    campaignIds.push(noCreative.id);

    const resolved = await getActiveAdForPlacement("CATEGORY_TOP", category.id);
    expect(resolved).toBeNull();
  });
});
