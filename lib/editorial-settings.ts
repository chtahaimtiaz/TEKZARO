import "server-only";
import { prisma } from "./prisma";

export interface EditorialSettings {
  timezone: string;
}

const DEFAULT_TIMEZONE = "Asia/Karachi";

/** Lazy-default, not lazy-create — a plain read never writes a row. Only
 * updateEditorialSettingsAction (lib/editorial-settings-actions.ts) ever
 * writes the singleton row. */
export async function getEditorialSettings(): Promise<EditorialSettings> {
  const row = await prisma.editorialSettings.findUnique({ where: { id: "singleton" }, select: { timezone: true } });
  return { timezone: row?.timezone ?? DEFAULT_TIMEZONE };
}
