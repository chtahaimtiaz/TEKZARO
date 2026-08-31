import "server-only";
import { prisma } from "./prisma";
import type { Prisma, SystemEventLevel } from "@prisma/client";

export interface LogSystemEventInput {
  level: SystemEventLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}

/** Operational event log — deliberately separate from AuditLog (editorial
 * actions vs. system/operational events have different audiences and
 * different admin pages). Never throws — a logging failure must never take
 * down the operation it's describing. */
export async function logSystemEvent(input: LogSystemEventInput): Promise<void> {
  try {
    await prisma.systemEvent.create({
      data: {
        level: input.level,
        source: input.source,
        message: input.message,
        context: input.context as Prisma.InputJsonValue | undefined,
      },
    });
  } catch {
    // Intentionally swallowed — logging is best-effort observability, not a
    // correctness dependency for the caller.
  }
}
