import { NextResponse, type NextRequest } from "next/server";
import { runFullAutomationCycle } from "@/lib/jarvis/automation";
import { getSessionUser, requireRole } from "@/lib/auth";
import { CAN_MANAGE_SOURCES } from "@/lib/permissions";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";
import { logAction } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Same as other crons

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  
  let triggeredBy = "cron";
  let actorId = "system";

  // Allow either CRON_SECRET or a valid admin session
  if (!expected || authHeader !== `Bearer ${expected}`) {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requireRole(sessionUser, CAN_MANAGE_SOURCES);
      triggeredBy = "manual";
      actorId = sessionUser.id;
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`jarvis-run:${ip}`, { max: 10, windowMs: 10 * 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (triggeredBy === "manual") {
    await logAction({
      userId: actorId,
      action: "jarvis_run_triggered",
      entityType: "System",
      metadata: { trigger: "manual" },
    });
  }

  const result = await runFullAutomationCycle(triggeredBy);
  return NextResponse.json(result);
}
