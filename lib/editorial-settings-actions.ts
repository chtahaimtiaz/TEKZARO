"use server";

import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_SOURCES } from "./permissions";
import { logAction } from "./audit";

export async function updateEditorialSettingsAction(formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone || !Intl.supportedValuesOf("timeZone").includes(timezone)) {
    redirect("/admin/categories?error=" + encodeURIComponent("Not a recognized IANA timezone."));
  }

  await prisma.editorialSettings.upsert({
    where: { id: "singleton" },
    update: { timezone },
    create: { id: "singleton", timezone },
  });
  await logAction({
    userId: user.id,
    action: "editorial_settings_updated",
    entityType: "EditorialSettings",
    entityId: "singleton",
    metadata: { timezone },
  });
  redirect("/admin/categories");
}
