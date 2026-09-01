import "server-only";
import { prisma } from "./prisma";

export { isAuthorEligibleForCategory } from "./author-eligibility-shared";

export interface EditorAuthor {
  id: string;
  name: string;
  eligibleCategoryIds: string[];
}

/** Active authors, shaped for the article editor's author <select> to
 * filter/label entirely client-side. includeAuthorId (the article's
 * current author) is always included even if inactive, so an edit page
 * never silently drops the article's existing byline from the dropdown. */
export async function getAuthorsForEditor(includeAuthorId?: string): Promise<EditorAuthor[]> {
  const authors = await prisma.author.findMany({
    where: includeAuthorId ? { OR: [{ active: true }, { id: includeAuthorId }] } : { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, categories: { select: { id: true } } },
  });
  return authors.map((a) => ({ id: a.id, name: a.name, eligibleCategoryIds: a.categories.map((c) => c.id) }));
}

/** Deterministically picks an active author eligible for categoryId —
 * either a category-specific specialist or a generalist (zero category
 * links). Returns null when none exists; callers must treat that as
 * "skip, do not assign," never fall back to *any* author. */
export async function pickEligibleAuthor(categoryId: string): Promise<{ id: string; name: string } | null> {
  return prisma.author.findFirst({
    where: {
      active: true,
      OR: [{ categories: { none: {} } }, { categories: { some: { id: categoryId } } }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
