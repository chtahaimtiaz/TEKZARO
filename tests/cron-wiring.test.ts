import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the failure mode that made scheduled publishing look broken: a cron
 * route that is correct, tested, and simply never called often enough.
 *
 * /api/cron/publish-scheduled was scheduled only by vercel.json at
 * "0 1 * * *" — once daily, the tightest native cron the Vercel Hobby plan
 * permits — while the GitHub Actions workflow that polls every 15 minutes
 * invoked only ingest-news and verify-and-publish. An article scheduled for
 * an afternoon slot therefore stayed unpublished until the next morning.
 * Every unit test for the route passed throughout, because the route was
 * never the problem.
 *
 * So this asserts the wiring rather than the logic: every cron route in the
 * app is reachable from some scheduler, and the publishing route in
 * particular is on the frequent one.
 */

const WORKFLOW_DIR = join(process.cwd(), ".github", "workflows");
const CRON_DIR = join(process.cwd(), "app", "api", "cron");

function workflowText(): string {
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => readFileSync(join(WORKFLOW_DIR, f), "utf8"))
    .join("\n");
}

function vercelCronPaths(): string[] {
  const p = join(process.cwd(), "vercel.json");
  if (!existsSync(p)) return [];
  const parsed = JSON.parse(readFileSync(p, "utf8")) as { crons?: { path: string }[] };
  return (parsed.crons ?? []).map((c) => c.path);
}

const cronRoutes = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

describe("cron wiring", () => {
  it("finds the cron routes it expects to check", () => {
    expect(cronRoutes).toContain("publish-scheduled");
    expect(cronRoutes).toContain("ingest-news");
    expect(cronRoutes).toContain("verify-and-publish");
  });

  it("triggers every cron route from a scheduler — none is left orphaned", () => {
    const workflow = workflowText();
    const vercel = vercelCronPaths().join("\n");

    for (const route of cronRoutes) {
      const referenced = workflow.includes(`/api/cron/${route}`) || vercel.includes(`/api/cron/${route}`);
      expect(referenced, `/api/cron/${route} is never invoked by any scheduler`).toBe(true);
    }
  });

  it("publishes scheduled articles from the frequent poll, not only the daily Vercel cron", () => {
    const workflow = workflowText();
    expect(
      workflow.includes("/api/cron/publish-scheduled"),
      "publish-scheduled must run on the 15-minute workflow, or an article scheduled " +
        "for the afternoon will not go live until the next daily Vercel cron",
    ).toBe(true);

    // The poll itself must stay frequent for that to mean anything.
    expect(workflow).toMatch(/cron:\s*["']\*\/(?:5|10|15)\s+\*\s+\*\s+\*\s+\*["']/);
  });

  it("keeps the Vercel daily cron as a fallback rather than removing it", () => {
    // Redundant on purpose: if GitHub Actions is disabled or degraded, the
    // daily Vercel cron still eventually publishes. Safe because the route
    // is idempotent (compare-and-swap on status), so overlapping schedulers
    // cannot double-publish.
    expect(vercelCronPaths()).toContain("/api/cron/publish-scheduled");
  });
});
