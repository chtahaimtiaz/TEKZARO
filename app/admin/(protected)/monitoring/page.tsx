import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CAN_VIEW_MONITORING } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isAIConfigured } from "@/lib/ai/provider";
import { isSearchConfigured } from "@/lib/search/web-search";
import { isMediaUploadAvailable } from "@/lib/media/storage";
import { isEmailConfigured } from "@/lib/email/provider";
import { getPipelineSchedule, updatePipelineScheduleAction, MIN_INTERVAL_MINUTES } from "@/lib/pipeline-schedule";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { formatDateTime } from "@/lib/format";

const INTEGRATIONS = [
  {
    name: "AI assistance",
    detail: "Claims summaries, Pakistan-impact drafts, verify-and-synthesize, discovery drafts",
    envVar: "AI_API_KEY",
    check: isAIConfigured,
  },
  {
    name: "Web search",
    detail: "Primary/secondary source lookup for the verify-and-publish pipeline",
    envVar: "SEARCH_API_KEY",
    check: isSearchConfigured,
  },
  {
    name: "Media uploads",
    detail: "Editor image uploads and automated image acquisition storage",
    envVar: "STORAGE_PROVIDER + BLOB_READ_WRITE_TOKEN (or local disk in dev)",
    check: isMediaUploadAvailable,
  },
  {
    name: "Email delivery",
    detail: "Invites, password resets, notifications, newsletter confirmations & campaigns",
    envVar: "RESEND_API_KEY + EMAIL_FROM (or SMTP_HOST / PORT / USER / PASS)",
    check: isEmailConfigured,
  },
] as const;

export const dynamic = "force-dynamic";

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_VIEW_MONITORING.includes(user.role)) redirect("/admin");
  const { level, error } = await searchParams;

  let dbStatus: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  const where = level && ["INFO", "WARN", "ERROR"].includes(level) ? { level: level as "INFO" | "WARN" | "ERROR" } : {};
  const [events, lastCronRun, lastIngestRun, lastVerifyRun, lastEmail, pipelineSchedule] = await Promise.all([
    prisma.systemEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.systemEvent.findFirst({ where: { source: "cron.publish-scheduled" }, orderBy: { createdAt: "desc" } }),
    prisma.systemEvent.findFirst({ where: { source: "cron.ingest-news" }, orderBy: { createdAt: "desc" } }),
    prisma.systemEvent.findFirst({ where: { source: "cron.verify-publish" }, orderBy: { createdAt: "desc" } }),
    prisma.emailLog.findFirst({ orderBy: { createdAt: "desc" } }),
    getPipelineSchedule(),
  ]);

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Monitoring</h1>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <section className="mt-6">
        <h2 className="text-lg font-bold">Pipeline schedule</h2>
        <p className="mt-1 text-sm text-ink-muted">
          How often the ingestion and verify-and-publish cron endpoints actually do work when polled — the GitHub
          Actions workflow polls on a tight fixed schedule, but a poll that arrives before the interval below has
          elapsed is a cheap no-op.
        </p>
        <form action={updatePipelineScheduleAction} className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <label htmlFor="ingestionIntervalMinutes" className="text-sm text-ink-muted">
              Ingestion interval (minutes)
            </label>
            <input
              id="ingestionIntervalMinutes"
              name="ingestionIntervalMinutes"
              type="number"
              min={MIN_INTERVAL_MINUTES}
              step={1}
              defaultValue={pipelineSchedule.ingestionIntervalMinutes}
              required
              className="mt-2 w-full rounded-md border border-border-strong bg-paper p-2 text-ink"
            />
            <p className="mt-2 text-xs text-ink-muted">
              Last run: {pipelineSchedule.lastIngestionRunAt ? formatRelativeTime(pipelineSchedule.lastIngestionRunAt) : "Never"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <label htmlFor="verifyIntervalMinutes" className="text-sm text-ink-muted">
              Verify &amp; publish interval (minutes)
            </label>
            <input
              id="verifyIntervalMinutes"
              name="verifyIntervalMinutes"
              type="number"
              min={MIN_INTERVAL_MINUTES}
              step={1}
              defaultValue={pipelineSchedule.verifyIntervalMinutes}
              required
              className="mt-2 w-full rounded-md border border-border-strong bg-paper p-2 text-ink"
            />
            <p className="mt-2 text-xs text-ink-muted">
              Last run: {pipelineSchedule.lastVerifyRunAt ? formatRelativeTime(pipelineSchedule.lastVerifyRunAt) : "Never"}
            </p>
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <button type="submit" className="rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark">
              Save schedule
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Integration status</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Whether each optional integration is actually configured in this environment right now — not whether
          the code path exists.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INTEGRATIONS.map((integration) => {
            const configured = integration.check();
            return (
              <div key={integration.name} className="rounded-xl border border-border bg-paper-raised p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">{integration.name}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      configured ? "bg-pakistan-soft text-pakistan" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {configured ? "Configured" : "Not configured"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-ink-muted">{integration.detail}</p>
                {!configured && <p className="mt-2 text-xs text-ink-muted">Requires: {integration.envVar}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Database</p>
          <p className={`mt-1 font-serif text-xl font-bold ${dbStatus === "ok" ? "text-pakistan" : "text-red-600 dark:text-red-400"}`}>
            {dbStatus === "ok" ? "Reachable" : "Error"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Last scheduled-publish run</p>
          <p className="mt-1 font-serif text-lg font-bold">
            {lastCronRun ? formatDateTime(lastCronRun.createdAt) : "Not configured"}
          </p>
          {lastCronRun && <p className="mt-1 text-xs text-ink-muted">{lastCronRun.message}</p>}
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Last news ingestion run</p>
          <p className="mt-1 font-serif text-lg font-bold">
            {lastIngestRun ? formatDateTime(lastIngestRun.createdAt) : "Not configured"}
          </p>
          {lastIngestRun && <p className="mt-1 text-xs text-ink-muted">{lastIngestRun.message}</p>}
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Last verify/publish run</p>
          <p className="mt-1 font-serif text-lg font-bold">
            {lastVerifyRun ? formatDateTime(lastVerifyRun.createdAt) : "Not configured"}
          </p>
          {lastVerifyRun && <p className="mt-1 text-xs text-ink-muted">{lastVerifyRun.message}</p>}
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Last email send</p>
          <p className="mt-1 font-serif text-lg font-bold">
            {lastEmail ? formatDateTime(lastEmail.createdAt) : "Not configured"}
          </p>
          {lastEmail && <p className="mt-1 text-xs text-ink-muted">{lastEmail.status} — {lastEmail.to}</p>}
        </div>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">System events</h2>
          <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
            <select name="level" defaultValue={level || ""} className="rounded-md border border-border-strong p-1.5 bg-paper-raised text-ink">
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
                  <td className="p-3 text-ink-muted">{formatDateTime(e.createdAt)}</td>
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
