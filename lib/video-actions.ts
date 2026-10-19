"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_VIDEOS } from "./permissions";
import { logAction } from "./audit";
import { slugify } from "./slug";

const videoSchema = z.object({
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  videoUrl: z.string().trim().url(),
  thumbnailUrl: z.string().trim().optional(),
  duration: z.string().trim().optional(),
  categoryId: z.string().min(1),
  authorId: z.string().min(1),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  featured: z.coerce.boolean().default(false),
});

export async function createVideoAction(formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_VIDEOS);

  const raw = Object.fromEntries(formData);
  const parsed = videoSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/admin/videos/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }

  const { title, description, videoUrl, thumbnailUrl, duration, categoryId, authorId, status, featured } = parsed.data;

  const baseSlug = slugify(title);
  let slug = baseSlug || "video";
  let n = 1;
  while (await prisma.video.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${baseSlug}-${n}`;
  }

  const video = await prisma.video.create({
    data: {
      title,
      slug,
      description: description || null,
      videoUrl,
      thumbnailUrl: thumbnailUrl || null,
      duration: duration || null,
      categoryId,
      authorId,
      createdById: user.id,
      status,
      featured,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    },
  });

  await logAction({ userId: user.id, action: "video_created", entityType: "Video", entityId: video.id });
  redirect("/admin/videos");
}

export async function updateVideoAction(videoId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_VIDEOS);

  const raw = Object.fromEntries(formData);
  const parsed = videoSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/admin/videos/${videoId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }

  const { title, description, videoUrl, thumbnailUrl, duration, categoryId, authorId, status, featured } = parsed.data;

  const current = await prisma.video.findUnique({ where: { id: videoId } });
  if (!current) redirect("/admin/videos");

  const publishedAt = status === "PUBLISHED" && !current.publishedAt ? new Date() : current.publishedAt;

  await prisma.video.update({
    where: { id: videoId },
    data: {
      title,
      description: description || null,
      videoUrl,
      thumbnailUrl: thumbnailUrl || null,
      duration: duration || null,
      categoryId,
      authorId,
      status,
      featured,
      publishedAt,
    },
  });

  await logAction({ userId: user.id, action: "video_updated", entityType: "Video", entityId: videoId });
  redirect("/admin/videos");
}

export async function deleteVideoAction(videoId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_VIDEOS);

  await prisma.video.delete({ where: { id: videoId } });
  await logAction({ userId: user.id, action: "video_deleted", entityType: "Video", entityId: videoId });
  redirect("/admin/videos");
}

export async function toggleVideoPublishAction(videoId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_VIDEOS);

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) redirect("/admin/videos");

  const newStatus = video.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
  const publishedAt = newStatus === "PUBLISHED" && !video.publishedAt ? new Date() : video.publishedAt;

  await prisma.video.update({
    where: { id: videoId },
    data: {
      status: newStatus,
      publishedAt,
    },
  });

  await logAction({
    userId: user.id,
    action: newStatus === "PUBLISHED" ? "video_published" : "video_unpublished",
    entityType: "Video",
    entityId: videoId,
  });

  redirect("/admin/videos");
}
