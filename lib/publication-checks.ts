import type { ContentBlock } from "./content-blocks";

export interface PublicationCheckInput {
  title: string;
  slug: string;
  categoryId: string | null;
  authorId: string | null;
  blocks: ContentBlock[];
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  metaDescription: string | null;
  excerpt: string | null;
  /** Omit while evaluating client-side (no DB access) — publish/schedule
   * server actions always pass this in after a real uniqueness query. */
  slugAvailable?: boolean;
}

export interface PublicationCheckResult {
  id: string;
  label: string;
  passed: boolean;
  reason?: string;
}

function blockHasText(block: ContentBlock): boolean {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "pakistan-impact":
      return block.text.trim().length > 0;
    case "list":
      return block.items.some((i) => i.trim().length > 0);
    case "image":
      return true;
    default:
      return false;
  }
}

/**
 * The 7 required publication checks. Called identically by the editor's live
 * checklist (client-side, no DB) and by the publish/schedule server actions
 * (server-side, authoritative) — publish is rejected server-side even if a
 * client somehow bypassed the UI.
 */
export function evaluatePublicationChecks(input: PublicationCheckInput): PublicationCheckResult[] {
  const results: PublicationCheckResult[] = [];

  results.push({
    id: "title",
    label: "Title present and descriptive",
    passed: input.title.trim().length >= 10,
    reason: input.title.trim().length >= 10 ? undefined : "Title must be at least 10 characters.",
  });

  const slugValid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug);
  results.push({
    id: "slug",
    label: "Slug present, valid and unique",
    passed: slugValid && input.slugAvailable !== false,
    reason: !slugValid
      ? "Slug must be lowercase letters, numbers and hyphens only."
      : input.slugAvailable === false
        ? "This slug is already used by another article."
        : undefined,
  });

  results.push({
    id: "category",
    label: "Category assigned",
    passed: Boolean(input.categoryId),
    reason: input.categoryId ? undefined : "Choose a category before publishing.",
  });

  results.push({
    id: "author",
    label: "Author byline assigned",
    passed: Boolean(input.authorId),
    reason: input.authorId ? undefined : "Choose an author byline before publishing.",
  });

  const hasContent = input.blocks.some(blockHasText);
  results.push({
    id: "body",
    label: "Body has at least one written block",
    passed: hasContent,
    reason: hasContent ? undefined : "Add at least one paragraph, heading, quote or list with text.",
  });

  const imageOk = !input.featuredImageUrl || Boolean(input.featuredImageAlt?.trim());
  results.push({
    id: "image-alt",
    label: "Featured image has alt text (if an image is set)",
    passed: imageOk,
    reason: imageOk ? undefined : "Add alt text for the featured image, or remove the image URL.",
  });

  const seoOk = Boolean(input.metaDescription?.trim() || input.excerpt?.trim());
  results.push({
    id: "seo",
    label: "SEO description present",
    passed: seoOk,
    reason: seoOk ? undefined : "Add an SEO description or an excerpt.",
  });

  return results;
}

export function allChecksPassed(results: PublicationCheckResult[]): boolean {
  return results.every((r) => r.passed);
}
