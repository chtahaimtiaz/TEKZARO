import { NextResponse, type NextRequest } from "next/server";
import { getCurrentRun, getRecentRuns } from "@/lib/jarvis/automation";
import { getSessionUser, requireRole } from "@/lib/auth";
import { CAN_VIEW_MONITORING } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    requireRole(sessionUser, CAN_VIEW_MONITORING);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const current = await getCurrentRun();
  const recent = await getRecentRuns(10);
  
  return NextResponse.json({ current, recent });
}
