"use server";

import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_BUILD_DIGEST } from "./permissions";
import { logAction } from "./audit";
import type { DigestSection } from "@prisma/client";

function todayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getOrCreateTodaysDigest(userId: string) {
  const digestDate = todayDate();
  return prisma.digest.upsert({
    where: { digestDate },
    update: {},
    create: { digestDate, createdById: userId },
  });
}

export async function addDigestItemAction(digestId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_BUILD_DIGEST);
  const sourceItemId = String(formData.get("sourceItemId") ?? "");
  const section = String(formData.get("section") ?? "GLOBAL") as DigestSection;
  if (!sourceItemId) redirect("/admin/digest");

  const count = await prisma.digestItem.count({ where: { digestId, section } });
  await prisma.digestItem.create({
    data: { digestId, sourceItemId, section, order: count, addedById: user.id },
  });
  await logAction({ userId: user.id, action: "digest_item_added", entityType: "Digest", entityId: digestId, metadata: { sourceItemId, section } });
  redirect("/admin/digest");
}

export async function removeDigestItemAction(digestItemId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_BUILD_DIGEST);

  const item = await prisma.digestItem.delete({ where: { id: digestItemId } });
  await logAction({ userId: user.id, action: "digest_item_removed", entityType: "Digest", entityId: item.digestId });
  redirect("/admin/digest");
}

export async function setDigestStatusReadyAction(digestId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_BUILD_DIGEST);

  await prisma.digest.update({ where: { id: digestId }, data: { status: "READY" } });
  await logAction({ userId: user.id, action: "digest_marked_ready", entityType: "Digest", entityId: digestId });
  redirect("/admin/digest");
}
