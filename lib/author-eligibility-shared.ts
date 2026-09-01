// Pure, no DB, no "server-only" — deliberately split out of
// lib/author-eligibility.ts (which is server-only, touches prisma) so
// client components (ArticleEditor.tsx) can import this one predicate
// directly, same pattern as lib/workflow.ts's TRANSITION_LABELS.

/** An empty eligibleCategoryIds list means eligible for every category —
 * see the schema comment on Author.categories for why this is
 * default-permissive rather than default-restrictive. */
export function isAuthorEligibleForCategory(eligibleCategoryIds: string[], categoryId: string): boolean {
  return eligibleCategoryIds.length === 0 || eligibleCategoryIds.includes(categoryId);
}
