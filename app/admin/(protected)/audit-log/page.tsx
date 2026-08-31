import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_VIEW_AUDIT_LOG } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_VIEW_AUDIT_LOG.includes(user.role)) redirect("/admin");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count(),
  ]);

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Audit Log</h1>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">When</th>
              <th className="p-3">User</th>
              <th className="p-3">Action</th>
              <th className="p-3">Entity</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-border last:border-b-0">
                <td className="p-3 whitespace-nowrap text-ink-muted">{log.createdAt.toLocaleString()}</td>
                <td className="p-3">{log.user.name}</td>
                <td className="p-3 font-medium">{log.action}</td>
                <td className="p-3 text-ink-soft">
                  {log.entityType}
                  {log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ""}
                </td>
                <td className="max-w-xs truncate p-3 text-xs text-ink-muted">
                  {log.metadata ? JSON.stringify(log.metadata) : ""}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-muted">
                  No audit events recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm text-ink-muted">
        {total} total event{total === 1 ? "" : "s"} · Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
      </p>
    </div>
  );
}
