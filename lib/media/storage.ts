import "server-only";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  // Deliberately no SVG — an SVG can embed <script>, making it an XSS vector
  // if ever served/rendered inline rather than as a plain <img> source.
};
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export class UnsupportedFileTypeError extends Error {}
export class FileTooLargeError extends Error {}
export class StorageNotAvailableError extends Error {}

/**
 * True when running on Vercel's serverless platform — deliberately checked
 * via Vercel's own `VERCEL` system env var, not `NODE_ENV` (which reads
 * "production" on every Vercel build, previews included, and can't tell
 * "serverless, ephemeral filesystem" apart from "self-hosted, persistent
 * filesystem"). A self-hosted production deployment that intentionally sets
 * STORAGE_PROVIDER=local is unaffected by this check.
 */
export function isEphemeralFilesystemEnvironment(): boolean {
  return process.env.VERCEL === "1";
}

export function getStorageProvider(): string {
  return process.env.STORAGE_PROVIDER || "local";
}

export function isDurableStorageConfigured(): boolean {
  return getStorageProvider() !== "local";
}

/**
 * The single source of truth the upload route AND the admin UI both check
 * before allowing an upload. On Vercel with no durable provider configured,
 * this is false — uploads are refused with a clear message rather than
 * silently written to a filesystem that won't survive the next invocation.
 */
export function isMediaUploadAvailable(): boolean {
  if (isEphemeralFilesystemEnvironment() && !isDurableStorageConfigured()) return false;
  return true;
}

export interface SavedUpload {
  url: string;
  width?: number;
  height?: number;
}

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

/**
 * Provider-switched behind this one interface. Only the local-disk adapter
 * (STORAGE_PROVIDER=local, the default) is actually implemented and tested
 * this phase — it's correct for local dev and a self-hosted, persistent-
 * filesystem deployment. A real object-storage adapter (S3/R2/Vercel Blob)
 * would replace the body of this function alone; every caller
 * (ArticleEditor.tsx, MediaUploadButton.tsx, app/api/media/upload/route.ts)
 * only ever sees saveUpload/deleteUpload and needs no changes when that
 * adapter is added. It is NOT implemented here — shipping cloud-storage
 * code with no real bucket/credentials to test it against would mean
 * shipping untested code, which this project doesn't do.
 */
export async function saveUpload(file: File, _kind: "article" | "author"): Promise<SavedUpload> {
  if (!isMediaUploadAvailable()) {
    throw new StorageNotAvailableError(
      "Media uploads require durable object storage in production. STORAGE_PROVIDER is not set to a durable provider, and this is running on Vercel's ephemeral filesystem.",
    );
  }

  const provider = getStorageProvider();
  if (provider !== "local") {
    throw new StorageNotAvailableError(`Storage provider "${provider}" has no adapter implemented yet.`);
  }

  const ext = ALLOWED_MIME_TYPES[file.type];
  if (!ext) {
    throw new UnsupportedFileTypeError(
      `Unsupported file type "${file.type}". Allowed: ${Object.keys(ALLOWED_MIME_TYPES).join(", ")}.`,
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new FileTooLargeError(
      `File is ${(file.size / 1024 / 1024).toFixed(1)}MB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    );
  }

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dir = path.join(UPLOADS_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });

  // The saved filename is always a freshly generated UUID — never derived
  // from the client-supplied original filename — so there is no path-
  // traversal surface here at all, regardless of what the upload was named.
  const filename = `${randomUUID()}.${ext}`;
  const filePath = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return { url: `/uploads/${yyyy}/${mm}/${filename}` };
}

export async function deleteUpload(url: string): Promise<void> {
  if (getStorageProvider() !== "local") return; // no adapter to delete from
  if (!url.startsWith("/uploads/")) return;

  const resolved = path.resolve(path.join(process.cwd(), "public", url));
  // Defensive re-check even though callers only ever pass back a Media.url
  // this module generated itself: refuse to resolve outside the uploads root.
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return;

  await unlink(resolved).catch(() => {});
}
