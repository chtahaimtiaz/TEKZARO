import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import {
  shouldRunIngestion,
  shouldRunVerify,
  getPipelineSchedule,
  updatePipelineScheduleAction,
  recordIngestionRun,
  recordVerifyRun,
  MIN_INTERVAL_MINUTES,
} from "../lib/pipeline-schedule";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData, captureRedirect } from "./helpers";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function asEditor() {
  const editor = await createTestUser("EDITOR", "pipeline-schedule");
  trackUser(editor.id);
  await loginAs(editor.id);
}

afterAll(async () => {
  // Restore the real singleton to the production default cadence — tests
  // below intentionally set a short interval to prove the gate, and this
  // shared row is the same one the live cron routes read.
  await prisma.pipelineSchedule.upsert({
    where: { id: "singleton" },
    update: { ingestionIntervalMinutes: 60, verifyIntervalMinutes: 60 },
    create: { id: "singleton", ingestionIntervalMinutes: 60, verifyIntervalMinutes: 60 },
  });
  clearSession();
  await cleanupTestData();
});

describe("shouldRunIngestion / shouldRunVerify — pure boundary math", () => {
  it("returns true when there is no prior run at all", () => {
    expect(shouldRunIngestion({ ingestionIntervalMinutes: 60, lastIngestionRunAt: null })).toBe(true);
    expect(shouldRunVerify({ verifyIntervalMinutes: 60, lastVerifyRunAt: null })).toBe(true);
  });

  it("returns false just before the interval has elapsed", () => {
    const now = new Date("2026-01-01T01:00:00.000Z");
    const lastRun = new Date("2026-01-01T00:00:00.001Z"); // 59m59.999s ago
    expect(shouldRunIngestion({ ingestionIntervalMinutes: 60, lastIngestionRunAt: lastRun }, now)).toBe(false);
    expect(shouldRunVerify({ verifyIntervalMinutes: 60, lastVerifyRunAt: lastRun }, now)).toBe(false);
  });

  it("returns true exactly at and beyond the interval boundary", () => {
    const now = new Date("2026-01-01T01:00:00.000Z");
    const lastRunExact = new Date("2026-01-01T00:00:00.000Z"); // exactly 60m ago
    const lastRunPast = new Date("2025-12-31T23:00:00.000Z"); // 2h ago
    expect(shouldRunIngestion({ ingestionIntervalMinutes: 60, lastIngestionRunAt: lastRunExact }, now)).toBe(true);
    expect(shouldRunIngestion({ ingestionIntervalMinutes: 60, lastIngestionRunAt: lastRunPast }, now)).toBe(true);
    expect(shouldRunVerify({ verifyIntervalMinutes: 60, lastVerifyRunAt: lastRunExact }, now)).toBe(true);
  });

  it("respects independently configured intervals", () => {
    const now = new Date("2026-01-01T01:00:00.000Z");
    const lastRun = new Date("2026-01-01T00:45:00.000Z"); // 15m ago
    expect(shouldRunIngestion({ ingestionIntervalMinutes: 15, lastIngestionRunAt: lastRun }, now)).toBe(true);
    expect(shouldRunIngestion({ ingestionIntervalMinutes: 30, lastIngestionRunAt: lastRun }, now)).toBe(false);
  });
});

describe("getPipelineSchedule / recordIngestionRun / recordVerifyRun — integration against the real singleton", () => {
  it("recordIngestionRun and recordVerifyRun update only their own lastRunAt field", async () => {
    const before = Date.now();
    await recordIngestionRun();
    const afterIngestion = await getPipelineSchedule();
    expect(afterIngestion.lastIngestionRunAt).not.toBeNull();
    expect(afterIngestion.lastIngestionRunAt!.getTime()).toBeGreaterThanOrEqual(before);

    await recordVerifyRun();
    const afterVerify = await getPipelineSchedule();
    expect(afterVerify.lastVerifyRunAt).not.toBeNull();
    // The ingestion timestamp recorded a moment ago must survive the
    // separate verify-run write — these are two independent fields on one
    // singleton row, not a single "lastRunAt".
    expect(afterVerify.lastIngestionRunAt).not.toBeNull();
  });
});

describe("updatePipelineScheduleAction", () => {
  it("rejects an interval below MIN_INTERVAL_MINUTES with a friendly redirect error", async () => {
    await asEditor();
    const fd = formData({
      ingestionIntervalMinutes: String(MIN_INTERVAL_MINUTES - 1),
      verifyIntervalMinutes: "60",
    });
    const url = await captureRedirect(() => updatePipelineScheduleAction(fd));
    expect(url).toContain("/admin/monitoring?error=");
  });

  it("persists valid intervals for both endpoints independently", async () => {
    await asEditor();
    const fd = formData({
      ingestionIntervalMinutes: "20",
      verifyIntervalMinutes: "45",
    });
    await captureRedirect(() => updatePipelineScheduleAction(fd));

    const schedule = await getPipelineSchedule();
    expect(schedule.ingestionIntervalMinutes).toBe(20);
    expect(schedule.verifyIntervalMinutes).toBe(45);
  });
});
