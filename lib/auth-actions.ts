"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import {
  verifyPassword,
  hashPassword,
  createSession,
  destroySession,
  resetFailedLogins,
  recordFailedLogin,
  isLockedOut,
  getSessionUser,
  requireUser,
  invalidateOtherSessions,
} from "./auth";
import { logAction } from "./audit";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function loginAction(formData: FormData): Promise<void> {
  const nextPath = String(formData.get("next") || "/admin");
  const safeNext = nextPath.startsWith("/admin") ? nextPath : "/admin";

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/admin/login?error=invalid&next=${encodeURIComponent(safeNext)}`);
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (!user || !user.active) {
    redirect(`/admin/login?error=invalid&next=${encodeURIComponent(safeNext)}`);
  }

  if (await isLockedOut(user)) {
    redirect(`/admin/login?error=locked&next=${encodeURIComponent(safeNext)}`);
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    await recordFailedLogin(user.id, user.failedLoginAttempts);
    redirect(`/admin/login?error=invalid&next=${encodeURIComponent(safeNext)}`);
  }

  await resetFailedLogins(user.id);
  await createSession(user.id);
  await logAction({ userId: user.id, action: "login", entityType: "User", entityId: user.id });

  redirect(safeNext);
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  await destroySession();
  if (user) {
    await logAction({ userId: user.id, action: "logout", entityType: "User", entityId: user.id });
  }
  redirect("/admin/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12, "New password must be at least 12 characters."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "New password and confirmation don't match.",
    path: ["confirmPassword"],
  });

/** Available to any authenticated user at any time (not just when forced) —
 * verifies the current password, requires a genuinely new one, invalidates
 * every other session, and clears mustChangePassword. Never logs a password,
 * only the fact that one changed. */
export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    redirect(`/admin/change-password?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }

  const fullUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const currentValid = await verifyPassword(parsed.data.currentPassword, fullUser.passwordHash);
  if (!currentValid) {
    redirect("/admin/change-password?error=" + encodeURIComponent("Current password is incorrect."));
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    redirect("/admin/change-password?error=" + encodeURIComponent("New password must be different from the current one."));
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  await invalidateOtherSessions(user.id);
  await logAction({ userId: user.id, action: "password_changed", entityType: "User", entityId: user.id });

  redirect("/admin?notice=" + encodeURIComponent("Password updated."));
}
