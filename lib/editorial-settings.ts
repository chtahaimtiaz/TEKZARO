import "server-only";
import { prisma } from "./prisma";
import { EDITORIAL_TIMEZONE } from "./constants";

export interface EditorialSettings {
  timezone: string;
}

// Shared with lib/format.ts so the stored setting and the display default
// are one value — see the note on EDITORIAL_TIMEZONE.
const DEFAULT_TIMEZONE = EDITORIAL_TIMEZONE;

/** Lazy-default, not lazy-create — a plain read never writes a row. Only
 * updateEditorialSettingsAction (lib/editorial-settings-actions.ts) ever
 * writes the singleton row. */
export async function getEditorialSettings(): Promise<EditorialSettings> {
  const row = await prisma.editorialSettings.findUnique({ where: { id: "singleton" }, select: { timezone: true } });
  return { timezone: row?.timezone ?? DEFAULT_TIMEZONE };
}
