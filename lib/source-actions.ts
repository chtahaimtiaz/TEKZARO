"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_SOURCES } from "./permissions";
import { logAction } from "./audit";
import { ingestSource, type IngestResult } from "./ingestion/ingest";
import { ingestGoogleNewsSource } from "./ingestion/google-news";
import { getEligibleActiveSources, runBatchIngestion, type BatchIngestionSummary } from "./ingestion/batch-fetch";
import type { SourceTier, SourceType } from "@prisma/client";

const SOURCE_TYPES: SourceType[] = ["RSS", "ATOM", "COMPANY_NEWSROOM", "OFFICIAL_BLOG", "API", "OTHER", "GOOGLE_NEWS"];
const SOURCE_TIERS: SourceTier[] = ["TIER_1", "TIER_2", "TIER_3"];

const sourceSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url(),
  feedUrl: z.string().trim().url().optional().or(z.literal("")),
  type: z.enum(SOURCE_TYPES as [SourceType, ...SourceType[]]),
  tier: z.enum(SOURCE_TIERS as [SourceTier, ...SourceTier[]]),
  categoryId: z.string().trim().optional().or(z.literal("")),
  language: z.string().trim().optional().or(z.literal("")),
  country: z.string().trim().optional().or(z.literal("")),
  reliabilityNotes: z.string().trim().optional().or(z.literal("")),
});

function nullable(v?: string): string | null {
  return v && v.trim() ? v.trim() : null;
}

export async function createSourceAction(formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  const parsed = sourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/sources/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }
  const input = parsed.data;

  const source = await prisma.source.create({
    data: {
      name: input.name,
      url: input.url,
      feedUrl: nullable(input.feedUrl),
      type: input.type,
      tier: input.tier,
      categoryId: nullable(input.categoryId),
      language: nullable(input.language),
      country: nullable(input.country),
      reliabilityNotes: nullable(input.reliabilityNotes),
    },
  });

  await logAction({ userId: user.id, action: "source_created", entityType: "Source", entityId: source.id });
  redirect("/admin/sources");
}

export async function updateSourceAction(sourceId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  const parsed = sourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/sources/${sourceId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }
  const input = parsed.data;

  await prisma.source.update({
    where: { id: sourceId },
    data: {
      name: input.name,
      url: input.url,
      feedUrl: nullable(input.feedUrl),
      type: input.type,
      tier: input.tier,
      categoryId: nullable(input.categoryId),
      language: nullable(input.language),
      country: nullable(input.country),
      reliabilityNotes: nullable(input.reliabilityNotes),
    },
  });

  await logAction({ userId: user.id, action: "source_edited", entityType: "Source", entityId: sourceId });
  redirect("/admin/sources");
}

export async function setSourceActiveAction(sourceId: string, active: boolean): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  await prisma.source.update({ where: { id: sourceId }, data: { active } });
  await logAction({
    userId: user.id,
    action: active ? "source_enabled" : "source_disabled",
    entityType: "Source",
    entityId: sourceId,
  });
  redirect("/admin/sources");
}

export async function fetchSourceAction(sourceId: string): Promise<IngestResult> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);
  const source = await prisma.source.findUnique({ where: { id: sourceId }, select: { type: true } });
  if (source?.type === "GOOGLE_NEWS") return ingestGoogleNewsSource(sourceId, user.id);
  return ingestSource(sourceId, user.id);
}

/**
 * Admin-triggered batch ingestion for /admin/sources' "Fetch All" button —
 * the exact same eligibility query, per-source branching, concurrency, and
 * failure isolation as the cron route (lib/ingestion/batch-fetch.ts), just
 * triggered by a session instead of CRON_SECRET and attributed to the
 * clicking admin instead of the system actor. Never partially applies:
 * every eligible source is attempted independently, one failure never
 * aborts the rest (see runBatchIngestion).
 */
export async function fetchAllSourcesAction(): Promise<BatchIngestionSummary> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  const sources = await getEligibleActiveSources();
  const summary = await runBatchIngestion(sources, user.id);

  await logAction({
    userId: user.id,
    action: "sources_fetch_all",
    entityType: "Source",
    metadata: {
      sourcesChecked: summary.sourcesChecked,
      sourcesFailed: summary.sourcesFailed,
      itemsCreated: summary.itemsCreated,
      itemsSkippedExisting: summary.itemsSkippedExisting,
    },
  });

  return summary;
}

export interface DeleteSourceResult {
  ok: boolean;
  message: string;
}

/**
 * Deletes exactly one Source configuration — never a category, never other
 * sources, never articles. Refuses (rather than cascading through) when
 * this source has real historical dependencies: SourceItem.source and
 * ArticleSource.source both cascade-delete in the schema, which would
 * silently strip a published article's discovery record and "Sources"
 * attribution if this ever fired against a source that actually produced
 * real content. A source with zero such history (never fetched, or only
 * ever produced discovery noise nothing was ever built from — e.g. the
 * "Google"/"Google1" stray records observed in production) is safe to
 * remove outright; its own never-converted SourceItems cascade away with
 * it, which is exactly the cleanup a delete button is for. Deactivating
 * (the existing Active/Disabled toggle) remains the right tool for a
 * source with real history that should simply stop being polled.
 */
export async function deleteSourceAction(sourceId: string): Promise<DeleteSourceResult> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    select: {
      name: true,
      _count: { select: { articles: true } },
      items: { select: { id: true }, where: { convertedArticleId: { not: null } }, take: 1 },
    },
  });
  if (!source) return { ok: false, message: "Source not found — it may have already been deleted." };

  if (source._count.articles > 0 || source.items.length > 0) {
    return {
      ok: false,
      message:
        `"${source.name}" has historical articles or discoveries linked to it and can't be deleted — deleting it would remove that ` +
        `provenance. Use the Active/Disabled toggle to stop future fetches instead.`,
    };
  }

  await prisma.source.delete({ where: { id: sourceId } });
  await logAction({ userId: user.id, action: "source_deleted", entityType: "Source", entityId: sourceId, metadata: { name: source.name } });

  return { ok: true, message: `"${source.name}" deleted.` };
}
