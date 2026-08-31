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
import { checkRateLimit, getClientIp } from "./rate-limit";
import { consumePasswordResetToken } from "./password-reset";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function loginAction(formData: FormData): Promise<void> {
  const nextPath = String(formData.get("next") || "/admin");
  const safeNext = nextPath.startsWith("/admin") ? nextPath : "/admin";

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`login:${ip}`, { max: 10, windowMs: 10 * 60 * 1000 });
  if (!allowed) {
    redirect(`/admin/login?error=${encodeURIComponent("Too many attempts. Try again in a few minutes.")}&next=${encodeURIComponent(safeNext)}`);
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/admin/login?error=invalid&next=${encodeURIComponent(safeNext)}`);
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (!user || !user.active || user.role === "SYSTEM") {
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
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAction({ userId: user.id, action: "login", entityType: "User", entityId: user.id });

  redirect(safeNext);
}

const setPasswordWithTokenSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(12, "Password must be at least 12 characters."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Password and confirmation don't match.",
    path: ["confirmPassword"],
  });

/** The invite/reset counterpart to changePasswordAction — no current
 * session or current password required, just a valid single-use token
 * (see lib/password-reset.ts). Logs the user straight in afterwards. */
export async function setPasswordWithTokenAction(formData: FormData): Promise<void> {
  const parsed = setPasswordWithTokenSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    redirect(`/admin/set-password?token=${encodeURIComponent(String(formData.get("token") || ""))}&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input.")}`);
  }

  const claim = await consumePasswordResetToken(parsed.data.token);
  if (!claim) {
    redirect("/admin/set-password?error=" + encodeURIComponent("This link is invalid or has expired."));
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: claim.userId },
    data: { passwordHash, mustChangePassword: false },
  });
  await logAction({ userId: claim.userId, action: "password_set_via_token", entityType: "User", entityId: claim.userId, metadata: { purpose: claim.purpose } });

  await createSession(claim.userId);
  await prisma.user.update({ where: { id: claim.userId }, data: { lastLoginAt: new Date() } });

  redirect("/admin?notice=" + encodeURIComponent("Password set. Welcome to TEKZARO."));
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
