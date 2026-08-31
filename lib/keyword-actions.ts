"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_KEYWORDS } from "./permissions";
import { logAction } from "./audit";
import type { KeywordType } from "@prisma/client";

const KEYWORD_TYPES: KeywordType[] = ["PAKISTAN", "COMPANY", "TOPIC"];

const keywordSchema = z.object({
  term: z.string().trim().min(1),
  type: z.enum(KEYWORD_TYPES as [KeywordType, ...KeywordType[]]),
  priority: z.union([z.literal("on"), z.literal(null)]).optional(),
});

export async function createKeywordAction(formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_KEYWORDS);

  const parsed = keywordSchema.safeParse({
    term: formData.get("term"),
    type: formData.get("type"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) redirect(`/admin/keywords?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);

  const existing = await prisma.keyword.findUnique({ where: { term: parsed.data.term } });
  if (existing) redirect("/admin/keywords?error=" + encodeURIComponent("That keyword already exists."));

  const keyword = await prisma.keyword.create({
    data: { term: parsed.data.term, type: parsed.data.type, priority: parsed.data.priority === "on" },
  });
  await logAction({ userId: user.id, action: "keyword_created", entityType: "Keyword", entityId: keyword.id });
  redirect("/admin/keywords");
}

export async function setKeywordActiveAction(keywordId: string, active: boolean): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_KEYWORDS);

  await prisma.keyword.update({ where: { id: keywordId }, data: { active } });
  await logAction({
    userId: user.id,
    action: active ? "keyword_enabled" : "keyword_disabled",
    entityType: "Keyword",
    entityId: keywordId,
  });
  redirect("/admin/keywords");
}

export async function deleteKeywordAction(keywordId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_KEYWORDS);

  await prisma.keyword.delete({ where: { id: keywordId } });
  await logAction({ userId: user.id, action: "keyword_deleted", entityType: "Keyword", entityId: keywordId });
  redirect("/admin/keywords");
}
