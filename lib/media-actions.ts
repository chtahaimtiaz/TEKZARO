"use server";

import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_MEDIA } from "./permissions";
import { logAction } from "./audit";
import { deleteUpload } from "./media/storage";

export async function deleteMediaAction(mediaId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_MEDIA);

  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return;

  await deleteUpload(media.url);
  await prisma.media.delete({ where: { id: mediaId } });

  await logAction({
    userId: actor.id,
    action: "media_deleted",
    entityType: "Media",
    entityId: mediaId,
    metadata: { filename: media.filename },
  });
}

/** A human reviewer clears an automatically-acquired image for use. Sets
 * reuseStatus to ALLOWED — the same status a direct manual upload gets —
 * because that's exactly what this is: a person deliberately vouching for
 * the image, which is real permission regardless of how it was found. */
export async function approveMediaAction(mediaId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_MEDIA);

  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return;

  await prisma.media.update({
    where: { id: mediaId },
    data: { reuseStatus: "ALLOWED", reuseNotes: "Approved for use by staff." },
  });

  await logAction({
    userId: actor.id,
    action: "media_approved",
    entityType: "Media",
    entityId: mediaId,
    metadata: { filename: media.filename },
  });
}

/** A human reviewer rejects an automatically-acquired image. Rejection has
 * teeth: the stored file is actually deleted (same deleteUpload() call
 * deleteMediaAction makes), not just flagged — a rejected image's bytes
 * must not keep sitting at a live, guessable URL. The Media row itself is
 * kept (status REJECTED) rather than deleted, both as an audit trail and so
 * Article.featuredMediaId's onDelete:SetNull can never silently erase the
 * "why was this rejected" record out from under an article that once
 * linked it — REJECTED is already non-publishable regardless. See
 * invariant rule 6. */
export async function rejectMediaAction(mediaId: string): Promise<void> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_MEDIA);

  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return;

  await deleteUpload(media.url);
  await prisma.media.update({
    where: { id: mediaId },
    data: { reuseStatus: "REJECTED", reuseNotes: "Rejected by staff; stored file removed." },
  });

  await logAction({
    userId: actor.id,
    action: "media_rejected",
    entityType: "Media",
    entityId: mediaId,
    metadata: { filename: media.filename },
  });
}
