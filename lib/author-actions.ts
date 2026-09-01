"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_AUTHORS } from "./permissions";
import { logAction } from "./audit";
import { slugify } from "./slug";

const authorSchema = z.object({
  name: z.string().trim().min(1),
  photoUrl: z.string().trim().optional().or(z.literal("")),
  bio: z.string().trim().optional().or(z.literal("")),
  position: z.string().trim().optional().or(z.literal("")),
});

function nullable(v?: string): string | null {
  return v && v.trim() ? v.trim() : null;
}

function parseCategoryIds(formData: FormData): string[] {
  return formData.getAll("categoryIds").map(String).filter(Boolean);
}

export async function createAuthorAction(formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_AUTHORS);

  const parsed = authorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/authors?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }
  const { name, photoUrl, bio, position } = parsed.data;
  const categoryIds = parseCategoryIds(formData);

  const baseSlug = slugify(name);
  let slug = baseSlug || "author";
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (await prisma.author.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${baseSlug}-${n}`;
  }

  const author = await prisma.author.create({
    data: {
      name,
      slug,
      photoUrl: nullable(photoUrl),
      bio: nullable(bio),
      position: nullable(position),
      categories: { connect: categoryIds.map((id) => ({ id })) },
    },
  });
  await logAction({ userId: user.id, action: "author_created", entityType: "Author", entityId: author.id });
  redirect("/admin/authors");
}

export async function updateAuthorAction(authorId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_AUTHORS);

  const parsed = authorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/authors/${authorId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }
  const { name, photoUrl, bio, position } = parsed.data;
  const categoryIds = parseCategoryIds(formData);

  const before = await prisma.author.findUnique({ where: { id: authorId }, select: { categories: { select: { id: true } } } });
  const beforeIds = new Set(before?.categories.map((c) => c.id) ?? []);
  const afterIds = new Set(categoryIds);

  await prisma.author.update({
    where: { id: authorId },
    data: {
      name,
      photoUrl: nullable(photoUrl),
      bio: nullable(bio),
      position: nullable(position),
      categories: { set: categoryIds.map((id) => ({ id })) },
    },
  });
  await logAction({ userId: user.id, action: "author_updated", entityType: "Author", entityId: authorId });

  const added = [...afterIds].filter((id) => !beforeIds.has(id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  if (added.length || removed.length) {
    await logAction({
      userId: user.id,
      action: "author_eligibility_changed",
      entityType: "Author",
      entityId: authorId,
      metadata: { added, removed },
    });
  }
  redirect("/admin/authors");
}

export async function setAuthorActiveAction(authorId: string, active: boolean): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_AUTHORS);

  await prisma.author.update({ where: { id: authorId }, data: { active } });
  await logAction({
    userId: user.id,
    action: active ? "author_activated" : "author_deactivated",
    entityType: "Author",
    entityId: authorId,
  });
  redirect("/admin/authors");
}
