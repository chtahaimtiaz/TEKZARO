"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, type ThemePreference } from "./theme";

/** Not httpOnly — ThemeToggle's own initial render already gets the current
 * preference as a prop from its server-rendered parent (no client-side
 * cookie read needed), so there's no reason to block JS from it; keeping it
 * readable is simplest if some future client surface needs it. Preference,
 * not a secret, so this is a deliberate deviation from the session-cookie
 * pattern in lib/auth.ts rather than an oversight. */
export async function setThemeAction(theme: ThemePreference): Promise<void> {
  const store = await cookies();
  if (theme === "system") {
    store.delete(THEME_COOKIE);
    return;
  }
  store.set(THEME_COOKIE, theme, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
