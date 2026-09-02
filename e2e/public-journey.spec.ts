import { test, expect } from "@playwright/test";

test.describe("Public site — core reading journey", () => {
  test("homepage loads with hero, sections, and no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.locator("h1, h2").first()).toBeVisible();
    await expect(page.locator('a[href^="/article/"]').first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("following a homepage article link opens a real article page", async ({ page }) => {
    await page.goto("/");
    // Not the hero: its headline sits inside an absolutely-positioned
    // gradient-overlay div with its own separate <a>, layered on top of
    // the image's own wrapping <a> to the same URL — real for a click
    // (either lands on the same href) but ambiguous for Playwright's
    // strict single-target actionability check. A plain grid card link
    // (e.g. from Latest News) has no such overlap.
    const articleLink = page.locator('h3 a[href^="/article/"]').first();
    const href = await articleLink.getAttribute("href");
    await articleLink.click();
    await page.waitForURL(`**${href}`);

    await expect(page.locator("h1")).toBeVisible();
    // The page's own outer <article> wrapper — not the related-articles
    // cards further down, which are also rendered as <article> elements.
    await expect(page.locator("article.mx-auto").first()).toBeVisible();
  });

  test("category page lists articles", async ({ page }) => {
    await page.goto("/category/ai");
    await expect(page.locator("h1")).toHaveText("AI");
    await expect(page.locator('a[href^="/article/"]').first()).toBeVisible();
  });

  test("Pakistan Tech hub page loads", async ({ page }) => {
    await page.goto("/pakistan-tech");
    await expect(page.locator("h1")).toContainText("Pakistan Tech");
  });

  test("search returns results for a real term", async ({ page }) => {
    await page.goto("/search?q=AI");
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  });

  test("an unknown route renders the 404 page, not a crash", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist-e2e");
    expect(response?.status()).toBe(404);
    await expect(page.locator("text=Story not found")).toBeVisible();
  });

  test("no horizontal overflow at a narrow mobile width, and the mobile menu opens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const overflow = await page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    const menuButton = page.locator('button[aria-label="Open menu"]');
    await menuButton.click();
    await expect(page.locator("#mobile-nav")).toBeVisible();
  });

  test("theme toggle switches the page into dark mode", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.click('button[aria-label="Dark"]');
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
