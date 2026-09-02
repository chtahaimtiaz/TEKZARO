import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { CAN_MANAGE_ADS } from "@/lib/permissions";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { saveUpload, isMediaUploadAvailable, UnsupportedFileTypeError, FileTooLargeError, StorageNotAvailableError } from "@/lib/media/storage";
import { logSystemEvent } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

/** Ad creatives are campaign-specific assets, not shared Media-library
 * images — this stores the file via the same durable-storage adapter
 * (lib/media/storage.ts) but never creates a Media row; the returned URL
 * is saved onto AdCreative directly by upsertAdCreativeAction. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !CAN_MANAGE_ADS.includes(user.role)) {
    return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  }

  if (!isMediaUploadAvailable()) {
    return NextResponse.json(
      { error: "Media uploads require durable object storage in production — not configured." },
      { status: 503 },
    );
  }

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`ad-upload:${user.id}:${ip}`, { max: 30, windowMs: 10 * 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many uploads. Try again in a few minutes." }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const saved = await saveUpload(file, "ad");
    return NextResponse.json({ url: saved.url });
  } catch (err: unknown) {
    if (err instanceof UnsupportedFileTypeError || err instanceof FileTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof StorageNotAvailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Upload failed.";
    await logSystemEvent({ level: "ERROR", source: "ads.creative_upload", message });
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
