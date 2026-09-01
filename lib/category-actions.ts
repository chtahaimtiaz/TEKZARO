"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_SOURCES } from "./permissions";
import { logAction } from "./audit";
import { slugify } from "./slug";

const categorySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().or(z.literal("")),
});

function nullable(v?: string): string | null {
  return v && v.trim() ? v.trim() : null;
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/categories?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }
  const { name, description } = parsed.data;

  const baseSlug = slugify(name);
  let slug = baseSlug || "category";
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (await prisma.category.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${baseSlug}-${n}`;
  }

  const existingByName = await prisma.category.findUnique({ where: { name } });
  if (existingByName) {
    redirect("/admin/categories?error=" + encodeURIComponent("A category with that name already exists."));
  }

  const category = await prisma.category.create({
    data: { name, slug, description: nullable(description) },
  });
  await logAction({ userId: user.id, action: "category_created", entityType: "Category", entityId: category.id });
  redirect("/admin/categories");
}

const quotaSchema = z.object({
  dailyTarget: z.coerce.number().int().min(0).max(100),
  active: z.union([z.literal("on"), z.literal(null)]).optional(),
  participatesInQuota: z.union([z.literal("on"), z.literal(null)]).optional(),
  requirePrimarySourceVerification: z.union([z.literal("on"), z.literal(null)]).optional(),
  minQualityNote: z.string().trim().optional().or(z.literal("")),
});

/** Daily Editorial Checklist config — see lib/editorial-checklist.ts.
 * Distinct from createCategoryAction/deleteCategoryAction, which only ever
 * handled name/description; this is genuinely new surface area, not an
 * extension of an existing update path (none existed before). */
export async function updateCategoryAction(categoryId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  const parsed = quotaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/categories?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }
  const { dailyTarget, active, participatesInQuota, requirePrimarySourceVerification, minQualityNote } = parsed.data;

  await prisma.category.update({
    where: { id: categoryId },
    data: {
      dailyTarget,
      active: active === "on",
      participatesInQuota: participatesInQuota === "on",
      requirePrimarySourceVerification: requirePrimarySourceVerification === "on",
      minQualityNote: nullable(minQualityNote),
    },
  });
  await logAction({
    userId: user.id,
    action: "category_quota_updated",
    entityType: "Category",
    entityId: categoryId,
    metadata: {
      dailyTarget,
      active: active === "on",
      participatesInQuota: participatesInQuota === "on",
      requirePrimarySourceVerification: requirePrimarySourceVerification === "on",
    },
  });
  redirect("/admin/categories");
}

export async function deleteCategoryAction(categoryId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  try {
    await prisma.category.delete({ where: { id: categoryId } });
    await logAction({ userId: user.id, action: "category_deleted", entityType: "Category", entityId: categoryId });
  } catch (err: unknown) {
    // Foreign-key violation — this category is still referenced by at least
    // one Article/SourceItem/Source. Surface an honest, specific reason
    // rather than a raw 500.
    const code = (err as { code?: string })?.code;
    if (code === "P2003" || code === "P2014") {
      redirect("/admin/categories?error=" + encodeURIComponent("This category is still in use and can't be deleted."));
    }
    throw err;
  }
  redirect("/admin/categories");
}
