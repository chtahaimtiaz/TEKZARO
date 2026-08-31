"use server";

import { prisma } from "./prisma";
import { getSessionUser, ForbiddenError } from "./auth";

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError();

  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { read: true },
  });
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError();

  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
}
