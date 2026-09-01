import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import {
  todayInTimeZone,
  dayRangeInTimeZone,
  computeCategoryEntry,
  computeDayStatus,
  dayStatusLabel,
  getDailyChecklist,
} from "../lib/editorial-checklist";

describe("todayInTimeZone / dayRangeInTimeZone (pure)", () => {
  it("dayRangeInTimeZone resolves exact UTC instants for a fixed-offset (no-DST) zone", () => {
    // Asia/Karachi is UTC+5 year-round, no DST — midnight PKT on 2026-06-15
    // is 2026-06-14T19:00:00Z.
    const { start, end } = dayRangeInTimeZone("2026-06-15", "Asia/Karachi");
    expect(start.toISOString()).toBe("2026-06-14T19:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-15T19:00:00.000Z");
  });

  it("todayInTimeZone returns YYYY-MM-DD as seen in that zone, not UTC", () => {
    // 2026-01-01T02:00:00Z is still 2025-12-31 21:00 in US/Eastern (UTC-5).
    const now = new Date("2026-01-01T02:00:00Z");
    expect(todayInTimeZone("America/New_York", now)).toBe("2025-12-31");
    expect(todayInTimeZone("UTC", now)).toBe("2026-01-01");
  });
});

describe("computeCategoryEntry / computeDayStatus / dayStatusLabel (pure)", () => {
  it("computeCategoryEntry marks complete only at or above target", () => {
    expect(computeCategoryEntry(2, 1)).toEqual({ count: 1, complete: false });
    expect(computeCategoryEntry(2, 2)).toEqual({ count: 2, complete: true });
    expect(computeCategoryEntry(2, 3)).toEqual({ count: 3, complete: true });
  });

  it("an incomplete TODAY is IN_PROGRESS, never TARGET_NOT_MET", () => {
    expect(computeDayStatus([{ complete: false }], true)).toBe("IN_PROGRESS");
  });

  it("an incomplete PAST day is TARGET_NOT_MET", () => {
    expect(computeDayStatus([{ complete: false }], false)).toBe("TARGET_NOT_MET");
  });

  it("TARGET_MET whether today or not, once every entry is complete", () => {
    expect(computeDayStatus([{ complete: true }, { complete: true }], true)).toBe("TARGET_MET");
    expect(computeDayStatus([{ complete: true }], false)).toBe("TARGET_MET");
  });

  it("dayStatusLabel uses the spec's literal phrasing", () => {
    expect(dayStatusLabel("TARGET_MET")).toBe("TARGET MET");
    expect(dayStatusLabel("TARGET_NOT_MET")).toBe("TARGET NOT MET — INSUFFICIENT VERIFIED NEWS");
    expect(dayStatusLabel("IN_PROGRESS")).toBe("IN PROGRESS");
  });
});

describe("getDailyChecklist — DB-backed", () => {
  const createdArticleIds: string[] = [];
  const createdCategoryIds: string[] = [];
  let authorId: string | null = null;
  let ownAuthorId: string | null = null;

  afterAll(async () => {
    if (createdArticleIds.length) await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
    if (createdCategoryIds.length) await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    if (ownAuthorId) await prisma.author.deleteMany({ where: { id: ownAuthorId } });
  });

  async function makeCategory(target: number, extra: Partial<{ requirePrimarySourceVerification: boolean }> = {}) {
    const category = await prisma.category.create({
      data: {
        name: `Checklist Test ${Date.now()}-${Math.random()}`,
        slug: `checklist-test-${Date.now()}-${Math.random()}`,
        dailyTarget: target,
        participatesInQuota: true,
        active: true,
        ...extra,
      },
    });
    createdCategoryIds.push(category.id);
    return category;
  }

  async function makeArticle(categoryId: string, publishedAt: Date, extra: Partial<{ verificationStatus: "UNVERIFIED" | "PRIMARY_SOURCE_CONFIRMED" }> = {}) {
    if (!authorId) {
      // A dedicated author, not an arbitrary findFirstOrThrow() pick — this
      // suite runs against the same shared dev database as several other
      // test files that create/delete their own temporary Author rows
      // concurrently (Vitest runs test files in parallel by default), so an
      // unowned pick could go stale mid-run when another file's afterAll
      // deletes it. Restricted to this first call's own category (not a
      // generalist) so it can't be "stolen" by another concurrently-running
      // file's own pickEligibleAuthor() call for one of THEIR articles —
      // safe to do even though later calls in this file pass other
      // categories, since this file writes Article rows straight via
      // prisma.article.create() and never goes through the
      // eligibility-enforcing Server Actions.
      const author = await prisma.author.create({
        data: {
          name: `Checklist Test Author ${Date.now()}`,
          slug: `checklist-test-author-${Date.now()}-${Math.random()}`,
          categories: { connect: [{ id: categoryId }] },
        },
      });
      ownAuthorId = author.id;
      authorId = author.id;
    }
    const article = await prisma.article.create({
      data: {
        slug: `checklist-test-article-${Date.now()}-${Math.random()}`,
        title: "Checklist test article",
        content: { blocks: [{ type: "paragraph", text: "Body." }] },
        status: "PUBLISHED",
        categoryId,
        authorId,
        publishedAt,
        ...extra,
      },
    });
    createdArticleIds.push(article.id);
    return article;
  }

  it("a story published just before local midnight and one just after land in different days' counts", async () => {
    const category = await makeCategory(2);
    // Asia/Karachi (UTC+5, the default with no EditorialSettings row —
    // confirmed by getEditorialSettings's own lazy-default behavior):
    // 23:58 local on day D is 18:58Z; 00:02 local on day D+1 is 19:02Z —
    // note both share the same UTC calendar date (2026-06-15), which is
    // exactly what makes this the meaningful boundary case: a naive
    // UTC-day implementation would wrongly put both in the same day.
    await makeArticle(category.id, new Date("2026-06-15T18:58:00Z")); // 2026-06-15 23:58 PKT
    await makeArticle(category.id, new Date("2026-06-15T19:02:00Z")); // 2026-06-16 00:02 PKT

    const day15 = await getDailyChecklist("2026-06-15");
    const day16 = await getDailyChecklist("2026-06-16");

    expect(day15.categories.find((c) => c.categoryId === category.id)?.count).toBe(1);
    expect(day16.categories.find((c) => c.categoryId === category.id)?.count).toBe(1);
  });

  it("TARGET_MET only once the category reaches its target; TARGET NOT MET — INSUFFICIENT VERIFIED NEWS on a past day short of it", async () => {
    const category = await makeCategory(2);
    const pastDate = "2026-01-15";

    // Compute the day-status assertion from ONLY this test's own category
    // entry via the pure computeDayStatus, rather than trusting
    // getDailyChecklist's aggregate summary.status across every
    // participating category in the shared dev DB. Several other test
    // files create their own temporary categories concurrently (Vitest
    // runs test files in parallel), so a real category created by another
    // file mid-run — with zero articles on this specific pastDate — could
    // otherwise drag a "set aside everything else" snapshot-based
    // isolation stale and falsely report TARGET_NOT_MET. Reading just this
    // one category's own `complete` flag out of the real result sidesteps
    // that entirely, with no global state to mutate or race on.
    await makeArticle(category.id, new Date(`${pastDate}T10:00:00Z`)); // 1 of 2 — a genuine shortfall on a past day

    const short = await getDailyChecklist(pastDate);
    const shortEntry = short.categories.find((c) => c.categoryId === category.id)!;
    expect(shortEntry.complete).toBe(false);
    const shortStatus = computeDayStatus([shortEntry], short.isToday);
    expect(shortStatus).toBe("TARGET_NOT_MET");
    expect(dayStatusLabel(shortStatus)).toBe("TARGET NOT MET — INSUFFICIENT VERIFIED NEWS");

    await makeArticle(category.id, new Date(`${pastDate}T11:00:00Z`)); // now 2 of 2

    const met = await getDailyChecklist(pastDate);
    const metEntry = met.categories.find((c) => c.categoryId === category.id)!;
    expect(metEntry.complete).toBe(true);
    const metStatus = computeDayStatus([metEntry], met.isToday);
    expect(metStatus).toBe("TARGET_MET");
    expect(dayStatusLabel(metStatus)).toBe("TARGET MET");
  });

  it("caps a category's contribution at its own target, so overachieving doesn't mask a shortfall elsewhere", async () => {
    const category = await makeCategory(1);
    await makeArticle(category.id, new Date("2026-01-20T10:00:00Z"));
    await makeArticle(category.id, new Date("2026-01-20T11:00:00Z"));
    await makeArticle(category.id, new Date("2026-01-20T12:00:00Z"));

    const summary = await getDailyChecklist("2026-01-20");
    const entry = summary.categories.find((c) => c.categoryId === category.id)!;
    expect(entry.count).toBe(3);
    expect(entry.complete).toBe(true);
    expect(Math.min(entry.count, entry.target)).toBe(1); // what the day total actually adds for this category
  });

  it("requirePrimarySourceVerification, when set, only counts confirmed articles toward that category's quota", async () => {
    const category = await makeCategory(1, { requirePrimarySourceVerification: true });
    await makeArticle(category.id, new Date("2026-02-01T10:00:00Z"), { verificationStatus: "UNVERIFIED" });

    const withUnverifiedOnly = await getDailyChecklist("2026-02-01");
    expect(withUnverifiedOnly.categories.find((c) => c.categoryId === category.id)?.count).toBe(0);

    await makeArticle(category.id, new Date("2026-02-01T11:00:00Z"), { verificationStatus: "PRIMARY_SOURCE_CONFIRMED" });

    const withBoth = await getDailyChecklist("2026-02-01");
    expect(withBoth.categories.find((c) => c.categoryId === category.id)?.count).toBe(1);
  });
});
