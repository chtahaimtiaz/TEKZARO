import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CAN_VIEW_MONITORING } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_VIEW_MONITORING.includes(user.role)) redirect("/admin");
  const { level } = await searchParams;

  let dbStatus: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  const where = level && ["INFO", "WARN", "ERROR"].includes(level) ? { level: level as "INFO" | "WARN" | "ERROR" } : {};
  const [events, lastCronRun, lastIngestRun, lastVerifyRun, lastEmail] = await Promise.all([
    prisma.systemEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.systemEvent.findFirst({ where: { source: "cron.publish-scheduled" }, orderBy: { createdAt: "desc" } }),
    prisma.systemEvent.findFirst({ where: { source: "cron.ingest-news" }, orderBy: { createdAt: "desc" } }),
    prisma.systemEvent.findFirst({ where: { source: "cron.verify-publish" }, orderBy: { createdAt: "desc" } }),
    prisma.emailLog.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Monitoring</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Database</p>
          <p className={`mt-1 font-serif text-xl font-bold ${dbStatus === "ok" ? "text-pakistan" : "text-red-600 dark:text-red-400"}`}>
            {dbStatus === "ok" ? "Reachable" : "Error"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Last scheduled-publish run</p>
          <p className="mt-1 font-serif text-lg font-bold">
            {lastCronRun ? lastCronRun.createdAt.toLocaleString() : "Not configured"}
          </p>
          {lastCronRun && <p className="mt-1 text-xs text-ink-muted">{lastCronRun.message}</p>}
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Last news ingestion run</p>
          <p className="mt-1 font-serif text-lg font-bold">
            {lastIngestRun ? lastIngestRun.createdAt.toLocaleString() : "Not configured"}
          </p>
          {lastIngestRun && <p className="mt-1 text-xs text-ink-muted">{lastIngestRun.message}</p>}
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Last verify/publish run</p>
          <p className="mt-1 font-serif text-lg font-bold">
            {lastVerifyRun ? lastVerifyRun.createdAt.toLocaleString() : "Not configured"}
          </p>
          {lastVerifyRun && <p className="mt-1 text-xs text-ink-muted">{lastVerifyRun.message}</p>}
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Last email send</p>
          <p className="mt-1 font-serif text-lg font-bold">
            {lastEmail ? lastEmail.createdAt.toLocaleString() : "Not configured"}
          </p>
          {lastEmail && <p className="mt-1 text-xs text-ink-muted">{lastEmail.status} — {lastEmail.to}</p>}
        </div>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">System events</h2>
          <form method="get" className="flex items-center gap-2 text-sm">
            <select name="level" defaultValue={level || ""} className="rounded-md border border-border-strong p-1.5">
              <option value="">All levels</option>
              <option value="INFO">Info</option>
              <option value="WARN">Warn</option>
              <option value="ERROR">Error</option>
            </select>
            <button type="submit" className="rounded-md bg-accent px-3 py-1.5 font-semibold text-white hover:bg-accent-dark">
              Filter
            </button>
          </form>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-paper-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="p-3">Level</th>
                <th className="p-3">Source</th>
                <th className="p-3">Message</th>
                <th className="p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-b-0">
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        e.level === "ERROR" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : e.level === "WARN" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-paper text-ink-muted"
                      }`}
                    >
                      {e.level}
                    </span>
                  </td>
                  <td className="p-3 text-ink-soft">{e.source}</td>
                  <td className="p-3">{e.message}</td>
                  <td className="p-3 text-ink-muted">{e.createdAt.toLocaleString()}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-ink-muted">
                    No system events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
