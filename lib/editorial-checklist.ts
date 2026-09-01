import "server-only";
import { prisma } from "./prisma";
import { PUBLISHED } from "./articles";
import { getEditorialSettings } from "./editorial-settings";
import type { ArticleVerificationStatus } from "@prisma/client";

// --- Timezone handling — dependency-free (no date library in this project) ---

/** How far timeZone is ahead of UTC at the instant utcMillis represents —
 * e.g. +5h for Asia/Karachi. Positive means the zone is ahead of UTC. */
function offsetMillisAt(utcMillis: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMillis));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  // Some ICU implementations return "24" for midnight with hour12:false.
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const shownAsUtcMillis = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
  return shownAsUtcMillis - utcMillis;
}

/** Resolves local midnight on (year, month, day) in timeZone to the UTC
 * instant that displays as that wall-clock time. Each pass re-estimates
 * the zone's offset and re-applies it FROM THE ORIGINAL naive guess (never
 * compounding an already-applied correction) — a second pass only refines
 * the offset estimate near a DST transition; it must never shift the
 * result twice for a constant-offset zone. Exact for day boundaries (they
 * never land inside a DST transition themselves); not a general-purpose
 * wall-clock converter. */
function utcInstantForWallClock(year: number, month: number, day: number, timeZone: string): Date {
  const naiveGuessMillis = Date.UTC(year, month - 1, day, 0, 0, 0);
  let correctedGuessMillis = naiveGuessMillis;

  for (let pass = 0; pass < 2; pass++) {
    const offset = offsetMillisAt(correctedGuessMillis, timeZone);
    correctedGuessMillis = naiveGuessMillis - offset;
  }

  return new Date(correctedGuessMillis);
}

/** "YYYY-MM-DD" for `now` as seen in timeZone — the en-CA locale trick
 * yields that exact format directly, no manual joining. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function dayRangeInTimeZone(dateStr: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const start = utcInstantForWallClock(year, month, day, timeZone);
  // Date.UTC normalizes day overflow (day+1) automatically — no manual
  // month-rollover math needed.
  const end = utcInstantForWallClock(year, month, day + 1, timeZone);
  return { start, end };
}

// --- Pure status computation — DB-free, so the trickiest cases are testable in isolation ---

export type DayStatus = "TARGET_MET" | "TARGET_NOT_MET" | "IN_PROGRESS";

export function computeCategoryEntry(target: number, articleCount: number): { count: number; complete: boolean } {
  return { count: articleCount, complete: articleCount >= target };
}

/** Three states, not two: an incomplete category on *today* is IN_PROGRESS
 * — there's still time, not a final verdict — never TARGET_NOT_MET. Only a
 * past, incomplete day gets TARGET_NOT_MET. */
export function computeDayStatus(entries: { complete: boolean }[], isToday: boolean): DayStatus {
  const allComplete = entries.every((e) => e.complete);
  if (allComplete) return "TARGET_MET";
  return isToday ? "IN_PROGRESS" : "TARGET_NOT_MET";
}

export function dayStatusLabel(status: DayStatus): string {
  if (status === "TARGET_MET") return "TARGET MET";
  if (status === "IN_PROGRESS") return "IN PROGRESS";
  return "TARGET NOT MET — INSUFFICIENT VERIFIED NEWS";
}

// --- The checklist itself ---

export interface CountedArticle {
  id: string;
  title: string;
  slug: string;
  featuredImageUrl: string | null;
  authorName: string;
  publishedAt: Date;
  verificationStatus: ArticleVerificationStatus;
}

export interface CategoryChecklistEntry {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  target: number;
  count: number;
  complete: boolean;
  minQualityNote: string | null;
  articles: CountedArticle[];
}

export interface DailyChecklistSummary {
  date: string;
  isToday: boolean;
  timezone: string;
  categories: CategoryChecklistEntry[];
  totalCategories: number;
  completedCategories: number;
  totalRequired: number;
  totalCompleted: number;
  percentComplete: number;
  status: DayStatus;
}

/**
 * One function, today AND history — history is the same code path with a
 * different dateStr, not a separate one, and needs zero extra storage (no
 * snapshot table; deleted articles simply stop counting on the next call,
 * which is the honest behavior the spec's own "deleted articles must not
 * count" rule implies).
 *
 * Counting rule: reaching Article.status "PUBLISHED" at all already
 * implies "verified, approved, published" per every path that can set it
 * (the human publish/schedule workflow, or lib/verification-actions.ts's
 * auto-publish gate) — see lib/articles.ts's PUBLISHED constant. No
 * separate verificationStatus filter is applied except when a category's
 * own requirePrimarySourceVerification opts into a stricter bar.
 */
export async function getDailyChecklist(dateStr?: string): Promise<DailyChecklistSummary> {
  const settings = await getEditorialSettings();
  const today = todayInTimeZone(settings.timezone);
  const date = dateStr ?? today;
  const isToday = date === today;
  const { start, end } = dayRangeInTimeZone(date, settings.timezone);

  const categories = await prisma.category.findMany({
    where: { active: true, participatesInQuota: true },
    orderBy: { name: "asc" },
  });
  const categoryIds = categories.map((c) => c.id);

  const articles = categoryIds.length
    ? await prisma.article.findMany({
        where: { ...PUBLISHED, categoryId: { in: categoryIds }, publishedAt: { gte: start, lt: end } },
        include: { author: { select: { name: true } } },
        orderBy: { publishedAt: "asc" },
      })
    : [];

  const byCategory = new Map<string, typeof articles>();
  for (const a of articles) {
    const list = byCategory.get(a.categoryId);
    if (list) list.push(a);
    else byCategory.set(a.categoryId, [a]);
  }

  const entries: CategoryChecklistEntry[] = categories.map((c) => {
    let categoryArticles = byCategory.get(c.id) ?? [];
    if (c.requirePrimarySourceVerification) {
      categoryArticles = categoryArticles.filter((a) => a.verificationStatus === "PRIMARY_SOURCE_CONFIRMED");
    }
    const { count, complete } = computeCategoryEntry(c.dailyTarget, categoryArticles.length);
    return {
      categoryId: c.id,
      categoryName: c.name,
      categorySlug: c.slug,
      target: c.dailyTarget,
      count,
      complete,
      minQualityNote: c.minQualityNote,
      articles: categoryArticles.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        featuredImageUrl: a.featuredImageUrl,
        authorName: a.author.name,
        // Guaranteed non-null: the query's publishedAt gte/lt filter only
        // ever matches non-null values.
        publishedAt: a.publishedAt as Date,
        verificationStatus: a.verificationStatus,
      })),
    };
  });

  const totalRequired = entries.reduce((sum, e) => sum + e.target, 0);
  const totalCompleted = entries.reduce((sum, e) => sum + Math.min(e.count, e.target), 0);
  const completedCategories = entries.filter((e) => e.complete).length;

  return {
    date,
    isToday,
    timezone: settings.timezone,
    categories: entries,
    totalCategories: entries.length,
    completedCategories,
    totalRequired,
    totalCompleted,
    percentComplete: totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 100,
    status: computeDayStatus(entries, isToday),
  };
}
