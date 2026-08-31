"use server";

import { z } from "zod";
import { prisma } from "./prisma";
import { getSessionUser, requireRole, hashPassword } from "./auth";
import { CAN_MANAGE_USERS } from "./permissions";
import { logAction } from "./audit";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["ADMIN", "EDITOR", "REPORTER", "RESEARCHER"];

const createUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(12),
  role: z.enum(ROLES as [Role, ...Role[]]),
});

export interface ActionResult {
  ok: boolean;
  error?: string;
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
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash, role: parsed.data.role },
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

export async function updateUserRoleAction(userId: string, formData: FormData): Promise<void> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_USERS);
  const role = formData.get("role");
  if (typeof role !== "string" || !ROLES.includes(role as Role)) return;

  const target = await prisma.user.update({ where: { id: userId }, data: { role: role as Role } });
  await logAction({
    userId: actor.id,
    action: "user_role_changed",
    entityType: "User",
    entityId: target.id,
    metadata: { role },
  });
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<void> {
  const sessionUser = await getSessionUser();
  const actor = requireRole(sessionUser, CAN_MANAGE_USERS);
  if (actor.id === userId && !active) return; // can't deactivate your own account

  await prisma.user.update({ where: { id: userId }, data: { active } });
  await logAction({
    userId: actor.id,
    action: active ? "user_activated" : "user_deactivated",
    entityType: "User",
    entityId: userId,
  });
}
