import "server-only";
import { cookies } from "next/headers";

export const THEME_COOKIE = "tekzaro_theme";
export type ThemePreference = "light" | "dark" | "system";

/** "system" (the default) means no cookie is written at all — the CSS in
 * app/globals.css falls back to prefers-color-scheme on its own. Only an
 * explicit "light"/"dark" choice is ever persisted. */
export async function getThemePreference(): Promise<ThemePreference> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return value === "light" || value === "dark" ? value : "system";
}
