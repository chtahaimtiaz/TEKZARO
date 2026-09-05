import "server-only";
import { prisma } from "../prisma";
import { isPublishableReuseStatus } from "../publication-checks";
import { acquireImageForSourceItem } from "./acquire";
import { logSystemEvent } from "../monitoring";

/** Builds the featured-image fields for a new draft from whatever image
 * lib/images/acquire.ts found for a source item, if any. Shared by
 * lib/discovery-actions.ts and lib/cluster-actions.ts (kept out of either
 * file to avoid a circular import — discovery-actions.ts already imports
 * from cluster-actions.ts).
 *
 * This is also where image acquisition is triggered. It deliberately does
 * NOT happen at ingest time: running it for every ingested item (~1,900/day)
 * left 1,975 of 1,999 stored images attached to no article at all, which
 * exhausted the object store's quota and broke every image on the site.
 * Acquiring here instead means an image is fetched only once an item is
 * genuinely becoming an article — the same images, a fraction of the volume.
 *
 * Per invariant rule 3: featuredMediaId is always set when an image was
 * found (so the editor sees "found, needs review" rather than nothing), but
 * featuredImageUrl — the actual rendering field — is only populated when
 * the linked Media's reuseStatus is honestly publishable. Never throws; a
 * missing/absent image just yields no image fields, exactly like today's
 * pre-acquisition behavior. */
export async function featuredImageFieldsFor(sourceItemId: string) {
  let media = await prisma.media.findFirst({
    where: { sourceItemId },
    orderBy: { createdAt: "desc" },
  });

  if (!media) {
    // Isolated exactly as the old ingest-time call site was: an image
    // problem (bad HTML, unreachable host, no usable candidate, storage
    // failure) must never abort the conversion this is part of.
    // acquireImageForSourceItem already never throws; this is
    // defense-in-depth on top of that.
    try {
      const item = await prisma.sourceItem.findUnique({
        where: { id: sourceItemId },
        select: { id: true, sourceUrl: true, headline: true },
      });
      if (item?.sourceUrl) {
        const acquisition = await acquireImageForSourceItem(item);
        if (acquisition.ok) {
          media = await prisma.media.findFirst({ where: { sourceItemId }, orderBy: { createdAt: "desc" } });
        } else {
          await logSystemEvent({
            level: "INFO",
            source: "images.acquire",
            message: `No image acquired for source item ${sourceItemId}: ${acquisition.reason}`,
            context: { sourceItemId, sourceUrl: item.sourceUrl },
          });
        }
      }
    } catch (err) {
      await logSystemEvent({
        level: "WARN",
        source: "images.acquire",
        message: `Image acquisition threw unexpectedly for source item ${sourceItemId}: ${err instanceof Error ? err.message : String(err)}`,
        context: { sourceItemId },
      });
    }
  }

  if (!media) return {};

  const publishable = isPublishableReuseStatus(media.reuseStatus);
  return {
    featuredMediaId: media.id,
    featuredImageUrl: publishable ? media.url : null,
    featuredImageAlt: publishable ? media.altText : null,
    featuredImageCredit: publishable ? (media.credit ?? media.sourceDomain ?? null) : null,
  };
}
