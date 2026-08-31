import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_USERS } from "@/lib/permissions";
import { createUserAction, updateUserRoleAction, setUserActiveAction } from "@/lib/user-actions";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "EDITOR", "REPORTER", "RESEARCHER"] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const currentUser = await requireUser();
  if (!CAN_MANAGE_USERS.includes(currentUser.role)) redirect("/admin");
  const { error } = await searchParams;

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  async function handleCreate(formData: FormData) {
    "use server";
    const result = await createUserAction(formData);
    if (!result.ok) redirect(`/admin/users?error=${encodeURIComponent(result.error ?? "Failed to create user.")}`);
    redirect("/admin/users");
  }

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Users</h1>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
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
                    <select name="role" defaultValue={u.role} className="rounded-md border border-border-strong p-1.5 text-sm">
                      {ROLES.map((r) => (
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
                <td className="p-3 text-right">
                  <form action={setUserActiveAction.bind(null, u.id, !u.active)}>
                    <button type="submit" className="text-xs font-semibold text-accent hover:underline" disabled={u.id === currentUser.id && u.active}>
                      {u.active ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-8 rounded-xl border border-border bg-paper-raised p-5">
        <h2 className="text-lg font-bold">Add a user</h2>
        <form action={handleCreate} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input name="name" placeholder="Full name" required className="rounded-md border border-border-strong p-2 text-sm" />
          <input name="email" type="email" placeholder="Email" required className="rounded-md border border-border-strong p-2 text-sm" />
          <input name="password" type="password" placeholder="Temporary password (12+ chars)" required minLength={12} className="rounded-md border border-border-strong p-2 text-sm" />
          <select name="role" className="rounded-md border border-border-strong p-2 text-sm">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark sm:col-span-2">
            Create user
          </button>
        </form>
      </section>
    </div>
  );
}
