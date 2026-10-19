import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CAN_VIEW_MONITORING } from "@/lib/permissions";
import { getJarvisConfig, getInstagramConfig } from "@/lib/jarvis/config";
import { getCurrentRun, getRecentRuns } from "@/lib/jarvis/automation";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function JarvisDashboard() {
  const user = await requireUser();
  if (!CAN_VIEW_MONITORING.includes(user.role)) redirect("/admin");

  const jarvisConfig = getJarvisConfig();
  const instaConfig = getInstagramConfig();
  const currentRun = await getCurrentRun();
  const recentRuns = await getRecentRuns(10);

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">JARVIS Automation</h1>
      
      <section className="mt-6">
        <h2 className="text-lg font-bold">Configuration</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="text-sm font-semibold text-ink-muted">Master Switch</h3>
            <p className="mt-1 text-2xl font-bold">{jarvisConfig.automationEnabled ? "ENABLED" : "DISABLED"}</p>
            {jarvisConfig.emergencyStop && <p className="mt-1 text-xs text-red-500 font-bold">EMERGENCY STOP ACTIVE</p>}
          </div>
          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="text-sm font-semibold text-ink-muted">Operating Mode</h3>
            <p className="mt-1 text-lg font-bold">{jarvisConfig.dryRun ? "DRY RUN" : (jarvisConfig.approvalMode ? "APPROVAL ONLY" : "AUTO-PUBLISH")}</p>
          </div>
          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="text-sm font-semibold text-ink-muted">Instagram</h3>
            <p className="mt-1 text-lg font-bold">{instaConfig.enabled ? (instaConfig.autoPublish ? "AUTO-PUBLISH" : "APPROVAL ONLY") : "DISABLED"}</p>
          </div>
          <div className="rounded-xl border border-border bg-paper-raised p-5">
            <h3 className="text-sm font-semibold text-ink-muted">Rate Limits</h3>
            <p className="mt-1 text-sm">Articles: {jarvisConfig.maxArticlesPerRun}/run, {jarvisConfig.maxArticlesPerDay}/day</p>
            <p className="mt-1 text-sm">Instagram: {instaConfig.maxPostsPerRun}/run, {instaConfig.maxPostsPerDay}/day</p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">Current Status</h2>
        {currentRun && currentRun.status === "RUNNING" ? (
          <div className="mt-3 p-4 border border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Run {currentRun.id} is currently executing (Started {formatRelativeTime(currentRun.startedAt)})</p>
          </div>
        ) : (
          <div className="mt-3 p-4 border border-border bg-paper-raised rounded-lg flex items-center justify-between">
            <p className="text-ink-muted">No automation run currently in progress.</p>
            <form action={async () => {
              "use server";
              const { runFullAutomationCycle } = await import("@/lib/jarvis/automation");
              await runFullAutomationCycle("manual");
              redirect("/admin/jarvis");
            }}>
              <button type="submit" disabled={!jarvisConfig.automationEnabled || jarvisConfig.emergencyStop} className="px-4 py-2 bg-accent text-white rounded-md font-semibold disabled:opacity-50">
                Run Now
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">Recent Runs</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-paper-raised">
              <tr>
                <th className="p-3 font-semibold text-ink-muted">Time</th>
                <th className="p-3 font-semibold text-ink-muted">Status</th>
                <th className="p-3 font-semibold text-ink-muted">Trigger</th>
                <th className="p-3 font-semibold text-ink-muted text-right">Articles</th>
                <th className="p-3 font-semibold text-ink-muted text-right">Instagram</th>
                <th className="p-3 font-semibold text-ink-muted">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentRuns.map((run) => (
                <tr key={run.id} className="bg-paper">
                  <td className="p-3 whitespace-nowrap">
                    {formatDateTime(run.startedAt)}
                    <br />
                    <span className="text-xs text-ink-muted">{formatRelativeTime(run.startedAt)}</span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      run.status === "COMPLETED" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" :
                      run.status === "FAILED" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" :
                      run.status === "RUNNING" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" :
                      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                    }`}>
                      {run.status}
                    </span>
                    {run.dryRun && <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">DRY RUN</span>}
                  </td>
                  <td className="p-3 text-ink-muted">{run.triggeredBy}</td>
                  <td className="p-3 text-right">
                    {run.articlesCreated} found
                    <br />
                    <span className="font-medium text-ink">{run.articlesPublished} published</span>
                  </td>
                  <td className="p-3 text-right">
                    {run.instagramAttempted} tried
                    <br />
                    <span className="font-medium text-ink">{run.instagramPublished} posted</span>
                  </td>
                  <td className="p-3 text-ink-muted text-xs max-w-[200px] truncate" title={run.errorSummary || ""}>
                    {run.errorSummary || (run.failures > 0 ? `${run.failures} failures` : "Success")}
                  </td>
                </tr>
              ))}
              {recentRuns.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-ink-muted">No automation runs recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
