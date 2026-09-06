import "server-only";
import { prisma } from "../prisma";
import { isPublishableReuseStatus } from "../publication-checks";
import { acquireImageForSourceItem, type AcquisitionOutcome } from "./acquire";
import { logSystemEvent } from "../monitoring";
import type { ImageReuseStatus } from "@prisma/client";

export interface FeaturedImageFields {
  featuredMediaId?: string;
  featuredImageUrl?: string | null;
  featuredImageAlt?: string | null;
  featuredImageCredit?: string | null;
}

export interface FeaturedImageDiagnostics {
  fields: FeaturedImageFields;
  /** null when a Media row already existed (nothing was attempted this
   * call — see featuredImageFieldsFor's own idempotency note) or the item
   * had no sourceUrl to try at all. */
  outcome: AcquisitionOutcome | null;
  reuseStatus: ImageReuseStatus | null;
  latencyMs: number;
}

/**
 * Same acquisition lookup as featuredImageFieldsFor, but also returns *why*
 * — the raw acquisition outcome, the resulting reuse status, and how long it
 * took. Callers that only need the Prisma-column fields (createDraftFromItemAction,
 * lib/cluster-actions.ts) keep using featuredImageFieldsFor unchanged below;
 * this is for callers that also want to record what happened, e.g. onto
 * GenerationMetric's image* columns.
 */
export async function featuredImageFieldsWithDiagnostics(sourceItemId: string): Promise<FeaturedImageDiagnostics> {
  const t0 = Date.now();
  let media = await prisma.media.findFirst({
    where: { sourceItemId },
    orderBy: { createdAt: "desc" },
  });
  let outcome: AcquisitionOutcome | null = null;

  if (!media) {
    try {
      const item = await prisma.sourceItem.findUnique({
        where: { id: sourceItemId },
        select: { id: true, sourceUrl: true, headline: true, imageUrl: true },
      });
      if (item?.sourceUrl) {
        const acquisition = await acquireImageForSourceItem({ ...item, feedImageUrl: item.imageUrl });
        outcome = acquisition.outcome ?? (acquisition.ok ? "ATTACHED" : "ERROR");
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
      outcome = "ERROR";
      await logSystemEvent({
        level: "WARN",
        source: "images.acquire",
        message: `Image acquisition threw unexpectedly for source item ${sourceItemId}: ${err instanceof Error ? err.message : String(err)}`,
        context: { sourceItemId },
      });
    }
  }

  const latencyMs = Date.now() - t0;
  if (!media) return { fields: {}, outcome, reuseStatus: null, latencyMs };

  const publishable = isPublishableReuseStatus(media.reuseStatus);
  return {
    fields: {
      featuredMediaId: media.id,
      featuredImageUrl: publishable ? media.url : null,
      featuredImageAlt: publishable ? media.altText : null,
      featuredImageCredit: publishable ? (media.credit ?? media.sourceDomain ?? null) : null,
    },
    outcome,
    reuseStatus: media.reuseStatus,
    latencyMs,
  };
}

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
 * pre-acquisition behavior.
 *
 * A thin wrapper over featuredImageFieldsWithDiagnostics, kept so every
 * existing caller's `...featuredImageFieldsFor(id)` spread into a Prisma
 * `data:` object keeps working unchanged — adding diagnostic keys directly
 * to this return value would break those calls the moment Prisma saw an
 * unrecognised column. */
export async function featuredImageFieldsFor(sourceItemId: string): Promise<FeaturedImageFields> {
  return (await featuredImageFieldsWithDiagnostics(sourceItemId)).fields;
}
