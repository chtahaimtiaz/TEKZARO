import "server-only";
import { prisma } from "./prisma";
import { slugify } from "./slugify";

export { slugify };

/**
 * Returns `base`, or `base-2`, `base-3`, ... the first variant not already
 * used by another article. Never silently overwrites an existing slug.
 */
export async function ensureUniqueSlug(base: string, excludeArticleId?: string): Promise<string> {
  const root = slugify(base) || "article";
  let candidate = root;
  let suffix = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.article.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeArticleId) return candidate;
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
}
