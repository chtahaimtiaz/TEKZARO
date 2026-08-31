import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { CAN_MANAGE_MEDIA } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  saveUpload,
  isMediaUploadAvailable,
  UnsupportedFileTypeError,
  FileTooLargeError,
  StorageNotAvailableError,
} from "@/lib/media/storage";
import { logSystemEvent } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !CAN_MANAGE_MEDIA.includes(user.role)) {
    return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  }

  if (!isMediaUploadAvailable()) {
    return NextResponse.json(
      { error: "Media uploads require durable object storage in production — not configured." },
      { status: 503 },
    );
  }

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`upload:${user.id}:${ip}`, { max: 30, windowMs: 10 * 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many uploads. Try again in a few minutes." }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const altText = String(formData.get("altText") || "");
  const kindRaw = String(formData.get("kind") || "article");
  const kind = kindRaw === "author" ? "author" : "article";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const saved = await saveUpload(file, kind);
    const media = await prisma.media.create({
      data: {
        url: saved.url,
        altText,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        width: saved.width,
        height: saved.height,
        uploadedById: user.id,
        // A human just deliberately chose to upload this file — that's real,
        // earned permission, unlike a scraped third-party image. See the
        // Non-negotiable invariant in the image-acquisition plan.
        reuseStatus: "ALLOWED",
        reuseNotes: "Manually uploaded by staff",
      },
    });

    await logAction({
      userId: user.id,
      action: "media_uploaded",
      entityType: "Media",
      entityId: media.id,
      metadata: { filename: media.filename, sizeBytes: media.sizeBytes },
    });

    return NextResponse.json({ id: media.id, url: media.url });
  } catch (err: unknown) {
    if (err instanceof UnsupportedFileTypeError || err instanceof FileTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof StorageNotAvailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Upload failed.";
    await logSystemEvent({ level: "ERROR", source: "media.upload", message });
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
