import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated, minimal, no sensitive detail — for Vercel's own checks
 * or an external uptime pinger the user may add later. No uptime-alerting
 * service is wired up (none was chosen); this endpoint exists for one to be
 * pointed at.
 */
export async function GET(): Promise<NextResponse> {
  let db: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "error";
  }

  const status = db === "ok" ? "ok" : "degraded";
  return NextResponse.json({ status, db, timestamp: new Date().toISOString() }, { status: db === "ok" ? 200 : 503 });
}
