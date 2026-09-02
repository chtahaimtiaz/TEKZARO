import { after } from "next/server";
import type { AdPlacement } from "@prisma/client";
import { getActiveAdForPlacement, logAdImpression } from "@/lib/ads";

interface AdSlotProps {
  placement: AdPlacement;
  /** null = no category context (e.g. the homepage feed slot) — see
   * resolveActiveCampaign in lib/ads.ts for exactly what that does and
   * doesn't match against a campaign's own categoryId. */
  categoryId?: string | null;
  path: string;
  className?: string;
}

/** Renders nothing when no campaign is currently deliverable for this slot
 * — an ad slot is never a layout placeholder, matching how CategorySection
 * etc. already return null on empty content. Always labeled "Sponsored"
 * per the standards promised on /advertise. */
export async function AdSlot({ placement, categoryId = null, path, className = "" }: AdSlotProps) {
  const resolved = await getActiveAdForPlacement(placement, categoryId);
  if (!resolved) return null;

  after(() => logAdImpression(resolved.campaign.id, path));

  return (
    <div className={`rounded-xl border border-border bg-paper-raised p-3 ${className}`}>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-muted">Sponsored</p>
      <a
        href={`/api/ads/click/${resolved.campaign.id}?path=${encodeURIComponent(path)}`}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="block overflow-hidden rounded-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- creative
            dimensions aren't known ahead of time (lib/media/storage.ts's
            SavedUpload.width/height are never actually populated by either
            storage adapter), so next/image's required width/height can't
            be supplied honestly here. */}
        <img src={resolved.creative.imageUrl} alt={resolved.creative.altText} className="w-full object-cover" />
      </a>
    </div>
  );
}
