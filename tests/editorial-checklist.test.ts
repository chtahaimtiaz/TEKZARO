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
  let authorId: string;
  let deactivatedOtherCategoryIds: string[] = [];

  afterAll(async () => {
    if (createdArticleIds.length) await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
    if (createdCategoryIds.length) await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    if (deactivatedOtherCategoryIds.length) {
      await prisma.category.updateMany({ where: { id: { in: deactivatedOtherCategoryIds } }, data: { participatesInQuota: true } });
    }
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
    if (!authorId) authorId = (await prisma.author.findFirstOrThrow()).id;
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

  it("TARGET_MET only once the (isolated) category reaches its target; TARGET NOT MET — INSUFFICIENT VERIFIED NEWS on a past day short of it", async () => {
    const category = await makeCategory(2);

    // Isolate the day-level status to just this one category — set every
    // other currently-participating category aside for this assertion,
    // same idiom tests/verification-actions.test.ts already established
    // for a different shared resource.
    const others = await prisma.category.findMany({ where: { participatesInQuota: true, id: { not: category.id } }, select: { id: true } });
    deactivatedOtherCategoryIds = others.map((c) => c.id);
    if (deactivatedOtherCategoryIds.length) {
      await prisma.category.updateMany({ where: { id: { in: deactivatedOtherCategoryIds } }, data: { participatesInQuota: false } });
    }

    try {
      const pastDate = "2026-01-15";
      await makeArticle(category.id, new Date(`${pastDate}T10:00:00Z`)); // 1 of 2 — a genuine shortfall on a past day

      const short = await getDailyChecklist(pastDate);
      expect(short.status).toBe("TARGET_NOT_MET");
      expect(dayStatusLabel(short.status)).toBe("TARGET NOT MET — INSUFFICIENT VERIFIED NEWS");

      await makeArticle(category.id, new Date(`${pastDate}T11:00:00Z`)); // now 2 of 2

      const met = await getDailyChecklist(pastDate);
      expect(met.status).toBe("TARGET_MET");
      expect(dayStatusLabel(met.status)).toBe("TARGET MET");
    } finally {
      if (deactivatedOtherCategoryIds.length) {
        await prisma.category.updateMany({ where: { id: { in: deactivatedOtherCategoryIds } }, data: { participatesInQuota: true } });
        deactivatedOtherCategoryIds = [];
      }
    }
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
