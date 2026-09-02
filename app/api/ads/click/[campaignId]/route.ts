import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAdClick } from "@/lib/ads";

export const dynamic = "force-dynamic";

/** The only link a rendered ad creative ever points at directly — logs the
 * click (without blocking the redirect) then sends the visitor on to the
 * advertiser's real destination URL. A campaign/creative that's gone
 * missing between render and click falls back to the homepage rather than
 * a broken link. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }): Promise<NextResponse> {
  const { campaignId } = await params;
  const path = new URL(request.url).searchParams.get("path") || "unknown";

  const creative = await prisma.adCreative.findUnique({ where: { campaignId } });
  if (!creative) return NextResponse.redirect(new URL("/", request.url));

  after(() => logAdClick(campaignId, path));
  return NextResponse.redirect(creative.targetUrl);
}
