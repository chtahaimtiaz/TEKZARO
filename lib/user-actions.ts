"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { getSessionUser, requireRole, hashPassword } from "./auth";
import { CAN_MANAGE_USERS, ASSIGNABLE_ROLES } from "./permissions";
import { logAction } from "./audit";
import { isEmailConfigured, sendEmail } from "./email/provider";
import { createPasswordResetToken } from "./password-reset";
import { siteUrl } from "./constants";
import type { Role } from "@prisma/client";

const createUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(12),
  role: z.enum(ASSIGNABLE_ROLES as [Role, ...Role[]]),
});

const inviteUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  role: z.enum(ASSIGNABLE_ROLES as [Role, ...Role[]]),
});

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Only set on the no-email fallback path — a one-time-reveal secret the
   * caller must show once and never persist/log. */
  revealOnce?: string;
}

export async function createUserAction(formData: FormData): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_USERS);

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      mustChangePassword: true,
    },
  });

  await logAction({
    userId: actor.id,
    action: "user_created",
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role },
  });

  return { ok: true };
}

/**
 * Preferred path when email is configured: the admin never learns the new
 * user's password (nobody but the invitee ever does). Creates the account
 * with an unusable placeholder passwordHash + mustChangePassword:true, then
 * emails a one-time set-password link. Falls back to createUserAction's
 * direct form when email isn't configured (checked in the UI via
 * isEmailConfigured()).
 */
export async function inviteUserAction(formData: FormData): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_USERS);

  const parsed = inviteUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const unusablePasswordHash = await hashPassword(randomBytes(32).toString("hex"));
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: unusablePasswordHash,
      role: parsed.data.role,
      mustChangePassword: true,
    },
  });

  const { rawToken } = await createPasswordResetToken(user.id, "INVITE");
  const link = `/admin/set-password?token=${rawToken}`;

  const emailResult = await sendEmail({
    to: user.email,
    subject: "You've been invited to TEKZARO",
    html: `<p>You've been invited to join the TEKZARO newsroom as ${user.role}.</p><p><a href="${siteUrl()}${link}">Set your password</a> to activate your account. This link expires in 24 hours.</p>`,
    text: `You've been invited to join the TEKZARO newsroom as ${user.role}.\n\nSet your password: ${siteUrl()}${link}\n\nThis link expires in 24 hours.`,
    relatedType: "User",
    relatedId: user.id,
  });

  await logAction({
    userId: actor.id,
    action: "user_invited",
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role, emailed: emailResult.ok },
  });

  if (!emailResult.ok) {
    // Should only happen if isEmailConfigured() was true a moment ago but
    // the actual send failed — surface the link once rather than leaving
    // the admin with an unreachable account.
    return { ok: true, revealOnce: `${siteUrl()}${link}` };
  }

  return { ok: true };
}

export async function updateUserRoleAction(userId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_USERS);
  const role = formData.get("role");
  if (typeof role !== "string" || !ASSIGNABLE_ROLES.includes(role as Role)) return;

  // SYSTEM protection: the where-clause's role exclusion means a request
  // targeting the SYSTEM user affects zero rows, atomically, even though
  // `role` itself is already validated against ASSIGNABLE_ROLES above.
  const result = await prisma.user.updateMany({
    where: { id: userId, role: { not: "SYSTEM" } },
    data: { role: role as Role },
  });
  if (result.count === 0) return;

  await logAction({
    userId: actor.id,
    action: "user_role_changed",
    entityType: "User",
    entityId: userId,
    metadata: { role },
  });
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<void> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_USERS);
  if (actor.id === userId && !active) return; // can't deactivate your own account

  const result = await prisma.user.updateMany({
    where: { id: userId, role: { not: "SYSTEM" } },
    data: { active },
  });
  if (result.count === 0) return;

  await logAction({
    userId: actor.id,
    action: active ? "user_activated" : "user_deactivated",
    entityType: "User",
    entityId: userId,
  });
}

/**
 * Admin-triggered password reset. Emails a set-new-password link if
 * possible; otherwise generates a one-time temp password, sets
 * mustChangePassword:true, and returns it once for the admin UI to reveal
 * — same "shown once, never logged" discipline as the Phase 4
 * bootstrap-password fix. Never logs the password/token value itself.
 */
export async function resetUserPasswordAction(userId: string): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_USERS);

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role === "SYSTEM") return { ok: false, error: "User not found." };

  if (isEmailConfigured()) {
    const { rawToken } = await createPasswordResetToken(target.id, "RESET");
    const link = `/admin/set-password?token=${rawToken}`;
    const emailResult = await sendEmail({
      to: target.email,
      subject: "Reset your TEKZARO password",
      html: `<p>A password reset was requested for your TEKZARO account.</p><p><a href="${siteUrl()}${link}">Set a new password</a>. This link expires in 2 hours. If you didn't request this, you can ignore this email.</p>`,
      text: `A password reset was requested for your TEKZARO account.\n\nSet a new password: ${siteUrl()}${link}\n\nThis link expires in 2 hours. If you didn't request this, you can ignore this email.`,
      relatedType: "User",
      relatedId: target.id,
    });

    await logAction({ userId: actor.id, action: "user_password_reset", entityType: "User", entityId: target.id, metadata: { method: "email" } });

    if (emailResult.ok) return { ok: true };
    // Fall through to the one-time-reveal path if the send itself failed.
  }

  const tempPassword = randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash, mustChangePassword: true },
  });

  await logAction({ userId: actor.id, action: "user_password_reset", entityType: "User", entityId: target.id, metadata: { method: "reveal_once" } });

  return { ok: true, revealOnce: tempPassword };
}
