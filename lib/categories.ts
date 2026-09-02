import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import type { Category } from "@prisma/client";

export const CATEGORIES_CACHE_TAG = "categories";

/** DB-backed replacement for the formerly-hardcoded CATEGORIES/PRIMARY_NAV/
 * OVERFLOW_NAV arrays in lib/constants.ts — the Category table (with its
 * admin CRUD at app/admin/(protected)/categories) is now the single source
 * of truth for public navigation too. Cached: SiteHeader renders on every
 * request, and a raw DB hit per page load would be a real regression vs.
 * the old zero-cost static array. createCategoryAction/updateCategoryAction/
 * deleteCategoryAction call updateTag(CATEGORIES_CACHE_TAG) (not
 * revalidateTag — they're Server Actions, and updateTag's read-your-own-
 * writes semantics mean the admin sees their own nav edit on the very next
 * request instead of Next 16's default stale-while-revalidate window). */
export const getActiveCategories = unstable_cache(
  async (): Promise<Category[]> => {
    return prisma.category.findMany({
      where: { active: true },
      orderBy: [{ navPriority: "asc" }, { name: "asc" }],
    });
  },
  ["active-categories"],
  { tags: [CATEGORIES_CACHE_TAG], revalidate: 300 },
);

/** Every publicly-navigable category (primary + overflow combined,
 * navPriority-ordered) — for surfaces like the footer's "Sections" list
 * that show the full set rather than splitting it into primary/overflow. */
export async function getAllNavCategories(): Promise<Category[]> {
  const categories = await getActiveCategories();
  return categories.filter((c) => c.navPriority !== null);
}

