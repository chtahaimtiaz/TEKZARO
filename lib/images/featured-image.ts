import "server-only";
import { prisma } from "../prisma";
import { isPublishableReuseStatus } from "../publication-checks";

/** Builds the featured-image fields for a new draft from whatever image
 * lib/images/acquire.ts found for a source item, if any. Shared by
 * lib/discovery-actions.ts and lib/cluster-actions.ts (kept out of either
 * file to avoid a circular import — discovery-actions.ts already imports
 * from cluster-actions.ts).
 *
 * Per invariant rule 3: featuredMediaId is always set when an image was
 * found (so the editor sees "found, needs review" rather than nothing), but
 * featuredImageUrl — the actual rendering field — is only populated when
 * the linked Media's reuseStatus is honestly publishable. Never throws; a
 * missing/absent image just yields no image fields, exactly like today's
 * pre-acquisition behavior. */
export async function featuredImageFieldsFor(sourceItemId: string) {
  const media = await prisma.media.findFirst({
    where: { sourceItemId },
    orderBy: { createdAt: "desc" },
  });
  if (!media) return {};

  const publishable = isPublishableReuseStatus(media.reuseStatus);
  return {
    featuredMediaId: media.id,
    featuredImageUrl: publishable ? media.url : null,
    featuredImageAlt: publishable ? media.altText : null,
    featuredImageCredit: publishable ? (media.credit ?? media.sourceDomain ?? null) : null,
  };
}
