import "server-only";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  // Deliberately no SVG — an SVG can embed <script>, making it an XSS vector
  // if ever served/rendered inline rather than as a plain <img> source.
};

// Vercel Functions enforce a hard 4.5MB request body limit (see
// vercel.com/docs/vercel-blob/server-upload) — this project's upload route
// reads the whole file via request.formData() server-side, so the cap has
// to stay under that regardless of storage provider. 4MB leaves headroom
// for multipart/form-data encoding overhead. (Was 8MB before this was
// verified against Vercel's current docs while adding the Blob adapter —
// a real, deliberate reduction, not an accidental behavior change.)
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

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
 * before allowing an upload. Provider-aware: "local" is never available on
 * Vercel's ephemeral filesystem; "vercel-blob" is only available once its
 * required credential is actually present — never silently falls back to
 * local storage in either case.
 */
export function isMediaUploadAvailable(): boolean {
  const provider = getStorageProvider();
  if (provider === "local") return !isEphemeralFilesystemEnvironment();
  if (provider === "vercel-blob") return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return false; // unknown provider value
}

export interface SavedUpload {
  url: string;
  width?: number;
  height?: number;
}

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

function validateUpload(file: File): { ext: string } {
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
  return { ext };
}

function uploadKey(ext: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  // The key is always a freshly generated UUID — never derived from the
  // client-supplied original filename — so there is no path-traversal
  // surface here at all, regardless of what the upload was named.
  return `uploads/${yyyy}/${mm}/${randomUUID()}.${ext}`;
}

async function saveUploadLocal(file: File, ext: string): Promise<SavedUpload> {
  const key = uploadKey(ext); // "uploads/yyyy/mm/uuid.ext", no leading slash
  const dir = path.join(process.cwd(), "public", path.dirname(key));
  await mkdir(dir, { recursive: true });
  const filePath = path.join(process.cwd(), "public", key);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);
  return { url: `/${key}` };
}

async function saveUploadVercelBlob(file: File, ext: string): Promise<SavedUpload> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new StorageNotAvailableError("BLOB_READ_WRITE_TOKEN is not configured.");
  }
  const key = uploadKey(ext);
  const blob = await put(key, file, { access: "public", contentType: file.type });
  return { url: blob.url };
}

async function deleteUploadLocal(url: string): Promise<void> {
  if (!url.startsWith("/uploads/")) return;
  const resolved = path.resolve(path.join(process.cwd(), "public", url));
  // Defensive re-check even though callers only ever pass back a Media.url
  // this module generated itself: refuse to resolve outside the uploads root.
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return;
  await unlink(resolved).catch(() => {});
}

async function deleteUploadVercelBlob(url: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  await del(url).catch(() => {});
}

/**
 * Provider-switched behind this one interface — the abstraction every
 * caller (ArticleEditor.tsx, MediaUploadButton.tsx,
 * app/api/media/upload/route.ts) depends on and needs no changes when the
 * provider changes.
 */
export async function saveUpload(file: File, _kind: "article" | "author" | "ad"): Promise<SavedUpload> {
  if (!isMediaUploadAvailable()) {
    throw new StorageNotAvailableError(
      "Media uploads require durable object storage in production. STORAGE_PROVIDER is not set to a durable, correctly-configured provider, and this is running on Vercel's ephemeral filesystem.",
    );
  }

  const { ext } = validateUpload(file);

  const provider = getStorageProvider();
  if (provider === "local") return saveUploadLocal(file, ext);
  if (provider === "vercel-blob") return saveUploadVercelBlob(file, ext);
  throw new StorageNotAvailableError(`Storage provider "${provider}" has no adapter implemented.`);
}

export async function deleteUpload(url: string): Promise<void> {
  const provider = getStorageProvider();
  if (provider === "local") return deleteUploadLocal(url);
  if (provider === "vercel-blob") return deleteUploadVercelBlob(url);
  // Unknown provider — nothing we can safely delete from.
}
