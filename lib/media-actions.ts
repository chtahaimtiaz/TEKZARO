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
