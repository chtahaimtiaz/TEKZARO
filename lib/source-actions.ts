"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_SOURCES } from "./permissions";
import { logAction } from "./audit";
import { ingestSource, type IngestResult } from "./ingestion/ingest";
import type { SourceTier, SourceType } from "@prisma/client";

const SOURCE_TYPES: SourceType[] = ["RSS", "ATOM", "COMPANY_NEWSROOM", "OFFICIAL_BLOG", "API", "OTHER"];
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
  return ingestSource(sourceId, user.id);
}
