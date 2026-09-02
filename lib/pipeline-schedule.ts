import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUser, requireRole } from "./auth";
import { CAN_MANAGE_SOURCES } from "./permissions";
import { logAction } from "./audit";

export interface PipelineSchedule {
  ingestionIntervalMinutes: number;
  verifyIntervalMinutes: number;
  lastIngestionRunAt: Date | null;
  lastVerifyRunAt: Date | null;
}

const DEFAULT_INGESTION_INTERVAL_MINUTES = 60;
const DEFAULT_VERIFY_INTERVAL_MINUTES = 60;

/** Floor matched to the tightest the GitHub Actions workflow itself ever
 * polls at — an interval shorter than that can never actually take effect,
 * so rejecting it here avoids a config that silently looks more aggressive
 * than it can be. */
export const MIN_INTERVAL_MINUTES = 15;

/** Lazy-default, not lazy-create — a plain read never writes a row. Only
 * updatePipelineScheduleAction and record{Ingestion,Verify}Run below ever
 * write the singleton row. */
export async function getPipelineSchedule(): Promise<PipelineSchedule> {
  const row = await prisma.pipelineSchedule.findUnique({ where: { id: "singleton" } });
  return {
    ingestionIntervalMinutes: row?.ingestionIntervalMinutes ?? DEFAULT_INGESTION_INTERVAL_MINUTES,
    verifyIntervalMinutes: row?.verifyIntervalMinutes ?? DEFAULT_VERIFY_INTERVAL_MINUTES,
    lastIngestionRunAt: row?.lastIngestionRunAt ?? null,
    lastVerifyRunAt: row?.lastVerifyRunAt ?? null,
  };
}

export function shouldRunIngestion(schedule: Pick<PipelineSchedule, "ingestionIntervalMinutes" | "lastIngestionRunAt">, now: Date = new Date()): boolean {
  if (!schedule.lastIngestionRunAt) return true;
  return now.getTime() - schedule.lastIngestionRunAt.getTime() >= schedule.ingestionIntervalMinutes * 60_000;
}

export function shouldRunVerify(schedule: Pick<PipelineSchedule, "verifyIntervalMinutes" | "lastVerifyRunAt">, now: Date = new Date()): boolean {
  if (!schedule.lastVerifyRunAt) return true;
  return now.getTime() - schedule.lastVerifyRunAt.getTime() >= schedule.verifyIntervalMinutes * 60_000;
}

export async function recordIngestionRun(): Promise<void> {
  await prisma.pipelineSchedule.upsert({
    where: { id: "singleton" },
    update: { lastIngestionRunAt: new Date() },
    create: { id: "singleton", lastIngestionRunAt: new Date() },
  });
}

export async function recordVerifyRun(): Promise<void> {
  await prisma.pipelineSchedule.upsert({
    where: { id: "singleton" },
    update: { lastVerifyRunAt: new Date() },
    create: { id: "singleton", lastVerifyRunAt: new Date() },
  });
}

export async function updatePipelineScheduleAction(formData: FormData): Promise<void> {
  "use server";
  const sessionUser = await getSessionUser();
  const user = requireRole(sessionUser, CAN_MANAGE_SOURCES);

  const ingestionIntervalMinutes = Number(formData.get("ingestionIntervalMinutes"));
  const verifyIntervalMinutes = Number(formData.get("verifyIntervalMinutes"));

  if (
    !Number.isInteger(ingestionIntervalMinutes) ||
    !Number.isInteger(verifyIntervalMinutes) ||
    ingestionIntervalMinutes < MIN_INTERVAL_MINUTES ||
    verifyIntervalMinutes < MIN_INTERVAL_MINUTES
  ) {
    redirect("/admin/monitoring?error=" + encodeURIComponent(`Intervals must be whole numbers of at least ${MIN_INTERVAL_MINUTES} minutes.`));
  }

  await prisma.pipelineSchedule.upsert({
    where: { id: "singleton" },
    update: { ingestionIntervalMinutes, verifyIntervalMinutes },
    create: { id: "singleton", ingestionIntervalMinutes, verifyIntervalMinutes },
  });
  await logAction({
    userId: user.id,
    action: "pipeline_schedule_updated",
    entityType: "PipelineSchedule",
    entityId: "singleton",
    metadata: { ingestionIntervalMinutes, verifyIntervalMinutes },
  });
  redirect("/admin/monitoring");
}
