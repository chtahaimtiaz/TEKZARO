import { test, expect } from "@playwright/test";
import path from "node:path";
import { createE2EUser, deleteE2EUsers, loginViaUI, uniqueLabel } from "./helpers";
import { prisma } from "../lib/prisma";

const IMG_PATH = path.join(__dirname, "fixtures", "test-creative.png");

test.describe("Admin — full ad campaign workflow, end to end", () => {
  let admin: Awaited<ReturnType<typeof createE2EUser>>;
  const advertiserIds: string[] = [];
  const campaignIds: string[] = [];

  test.beforeAll(async () => {
    admin = await createE2EUser("ADMIN", "ad-workflow");
  });

  test.afterAll(async () => {
    if (campaignIds.length) await prisma.adCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    if (advertiserIds.length) await prisma.advertiser.deleteMany({ where: { id: { in: advertiserIds } } });
    await deleteE2EUsers([admin.id]);
  });

  test("create advertiser -> campaign -> upload creative -> submit -> approve -> live on homepage -> pause", async ({ page }) => {
    // The full journey walks through several dev-mode cold-compiled routes
    // in sequence (new campaign, the upload API route, the campaign detail
    // page) — each pays its own one-time compile cost, so this needs more
    // headroom than the global per-test timeout.
    test.setTimeout(120_000);
    await loginViaUI(page, admin.email, admin.password);

    const advertiserName = uniqueLabel("Advertiser");
    const campaignName = uniqueLabel("Campaign");

    // Advertiser
    await page.goto("/admin/advertisers");
    await page.fill('input[name="name"]', advertiserName);
    await page.click('button:has-text("Add advertiser")');
    // createAdvertiserAction redirects back to this same /admin/advertisers
    // URL, so there's no real navigation for waitForURL to catch — wait for
    // the new row itself instead (see the note further down on the same
    // same-URL-redirect issue for the campaign workflow transitions).
    const row = page.locator("tr", { hasText: advertiserName });
    await expect(row).toBeVisible({ timeout: 20000 });
    const advertiserHref = await row.locator("a").first().getAttribute("href");
    expect(advertiserHref).toBeTruthy();
    const advertiserId = advertiserHref!.split("/").pop()!;
    advertiserIds.push(advertiserId);

    // Campaign
    await page.goto(advertiserHref!);
    await page.click('a:has-text("+ New campaign")');
    await page.waitForURL(/\/admin\/ad-campaigns\/new/);
    await expect(page.locator('select[name="advertiserId"]')).toHaveValue(advertiserId);

    const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.fill('input[name="name"]', campaignName);
    await page.selectOption('select[name="placement"]', "HOMEPAGE_FEED");
    await page.fill('input[name="startDate"]', start);
    await page.fill('input[name="endDate"]', end);
    await page.fill('input[name="priority"]', "100");
    await page.click('button:has-text("Create campaign")');
    await page.waitForURL(/\/admin\/ad-campaigns\/[a-z0-9]+$/);
    const campaignUrl = page.url();
    const campaignId = campaignUrl.split("/").pop()!;
    campaignIds.push(campaignId);
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();

    // Creative
    await page.setInputFiles('input[type="file"]', IMG_PATH);
    await expect(page.locator('img[alt="Creative preview"]')).toBeVisible({ timeout: 30000 });
    await page.fill('input[name="altText"]', "E2E creative");
    await page.fill('input[name="targetUrl"]', "https://example.com/e2e-landing");
    // These next actions redirect back to the SAME campaignUrl — there's
    // no URL change for waitForURL to meaningfully wait on (it resolves
    // immediately since the URL already matches), so the real
    // synchronization point is the content that only appears once the
    // redirect's re-render has actually landed. Confirmed live: without
    // this, the assertion below can run against the pre-submit DOM while
    // the page is still mid-render.
    await page.click('button:has-text("Save creative")');
    await expect(page.locator('input[name="altText"]')).toHaveValue("E2E creative", { timeout: 20000 });
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();

    // Workflow: submit -> approve. The exact bug this regression-guards
    // against: these buttons only exist once a transition is legal, and a
    // page that fails to serialize them crashes to the error boundary
    // right here rather than on initial load.
    await page.click('button:has-text("Submit for review")');
    await expect(page.locator("text=Pending review")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();

    await page.click('button:has-text("Approve")');
    await expect(page.locator("text=Active")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();

    // Live on the public homepage
    await page.goto("/");
    await expect(page.locator(`a[href^="/api/ads/click/${campaignId}"]`).first()).toBeVisible();
    await expect(page.locator("text=Sponsored").first()).toBeVisible();

    // Click-through redirects to the real destination, never exposing it
    // as the visible href.
    const clickHref = await page.locator(`a[href^="/api/ads/click/${campaignId}"]`).first().getAttribute("href");
    const resp = await page.request.get(clickHref!, { maxRedirects: 0, timeout: 30000 });
    expect(resp.status()).toBe(307);
    expect(resp.headers()["location"]).toBe("https://example.com/e2e-landing");

    // Pause — stop it from serving, matching the real ad-ops workflow this
    // test represents (a completed, non-renewed campaign gets paused, not
    // left running).
    await page.goto(campaignUrl);
    await page.click('button:has-text("Pause")');
    await expect(page.locator("text=Paused")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });
});
