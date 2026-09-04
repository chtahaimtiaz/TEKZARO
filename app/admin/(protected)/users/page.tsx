import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_USERS, ASSIGNABLE_ROLES } from "@/lib/permissions";
import { isEmailConfigured } from "@/lib/email/provider";
import {
  createUserAction,
  inviteUserAction,
  updateUserRoleAction,
  setUserActiveAction,
  resetUserPasswordAction,
} from "@/lib/user-actions";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { Prisma } from "@prisma/client";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; revealed?: string; q?: string; role?: string; status?: string; page?: string }>;
}) {
  const currentUser = await requireUser();
  if (!CAN_MANAGE_USERS.includes(currentUser.role)) redirect("/admin");
  const { error, revealed, q, role, status, page } = await searchParams;

  const emailConfigured = isEmailConfigured();
  const pageNum = Math.max(1, Number(page) || 1);

  const where: Prisma.UserWhereInput = { role: { not: "SYSTEM" } };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  if (role && ASSIGNABLE_ROLES.includes(role as (typeof ASSIGNABLE_ROLES)[number])) {
    where.role = role as (typeof ASSIGNABLE_ROLES)[number];
  }
  if (status === "active") where.active = true;
  if (status === "disabled") where.active = false;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleCreate(formData: FormData) {
    "use server";
    const result = emailConfigured ? await inviteUserAction(formData) : await createUserAction(formData);
    if (!result.ok) redirect(`/admin/users?error=${encodeURIComponent(result.error ?? "Failed to add user.")}`);
    if (result.revealOnce) redirect(`/admin/users?revealed=${encodeURIComponent(result.revealOnce)}`);
    redirect("/admin/users");
  }

  async function handleResetPassword(userId: string) {
    "use server";
    const result = await resetUserPasswordAction(userId);
    if (!result.ok) redirect(`/admin/users?error=${encodeURIComponent(result.error ?? "Failed to reset password.")}`);
    if (result.revealOnce) redirect(`/admin/users?revealed=${encodeURIComponent(result.revealOnce)}`);
    redirect("/admin/users");
  }

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Users</h1>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {revealed && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <p className="font-semibold">Shown once — copy it now, it will not be shown again:</p>
          <p className="mt-1 break-all font-mono text-xs">{revealed}</p>
          {revealed.startsWith("http") ? (
            <p className="mt-1">Send this set-password link to the user directly (email wasn&apos;t configured or the send failed).</p>
          ) : (
            <p className="mt-1">This is a one-time temporary password. The account is flagged to require a change at next sign-in.</p>
          )}
        </div>
      )}

      <form className="mt-6 flex flex-wrap items-end gap-3 text-sm" method="get">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Search</label>
          <input name="q" defaultValue={q} placeholder="Name or email" className="rounded-md border border-border-strong p-2" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Role</label>
          <select name="role" defaultValue={role || ""} className="rounded-md border border-border-strong p-2 bg-paper-raised text-ink">
            <option value="">All</option>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Status</label>
          <select name="status" defaultValue={status || ""} className="rounded-md border border-border-strong p-2 bg-paper-raised text-ink">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark">
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3">Last login</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-b-0">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3 text-ink-soft">{u.email}</td>
                <td className="p-3">
                  <form action={updateUserRoleAction.bind(null, u.id)} className="flex items-center gap-2">
                    <select name="role" defaultValue={u.role} className="rounded-md border border-border-strong p-1.5 text-sm bg-paper-raised text-ink">
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-semibold text-accent hover:underline">
                      Update
                    </button>
                  </form>
                </td>
                <td className="p-3">{u.active ? "Active" : "Disabled"}</td>
                <td className="p-3 text-ink-soft">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-3">
                    <form action={handleResetPassword.bind(null, u.id)}>
                      <button type="submit" className="text-xs font-semibold text-accent hover:underline">
                        Reset password
                      </button>
                    </form>
                    <form action={setUserActiveAction.bind(null, u.id, !u.active)}>
                      <button type="submit" className="text-xs font-semibold text-accent hover:underline" disabled={u.id === currentUser.id && u.active}>
                        {u.active ? "Disable" : "Enable"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">
                  No users match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <p className="mt-3 text-xs text-ink-muted">
          Page {pageNum} of {totalPages} ({total} users)
        </p>
      )}

      <section className="mt-8 rounded-xl border border-border bg-paper-raised p-5">
        <h2 className="text-lg font-bold">Add a user</h2>
        {emailConfigured ? (
          <p className="mt-1 text-sm text-ink-muted">
            Email is configured — the new user will be sent a one-time link to set their own password. Nobody else ever
            knows it.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            Email isn&apos;t configured, so you must set a temporary password directly. The account will be required to
            change it at first sign-in.
          </p>
        )}
        <form action={handleCreate} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input name="name" placeholder="Full name" required className="rounded-md border border-border-strong p-2 text-sm" />
          <input name="email" type="email" placeholder="Email" required className="rounded-md border border-border-strong p-2 text-sm" />
          {!emailConfigured && (
            <PasswordInput
              name="password"
              placeholder="Temporary password (12+ chars)"
              required
              minLength={12}
              className="rounded-md border border-border-strong p-2 text-sm"
            />
          )}
          <select name="role" className="rounded-md border border-border-strong p-2 text-sm bg-paper-raised text-ink">
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark sm:col-span-2">
            {emailConfigured ? "Send invite" : "Create user"}
          </button>
        </form>
      </section>
    </div>
  );
}
