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

/** Every credential the R2 adapter needs, or null when any is missing —
 *  so "configured" is one check rather than five scattered ones. */
function r2Config(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
} | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl: publicBaseUrl.replace(/\/+$/, "") };
}

/**
 * The single source of truth the upload route AND the admin UI both check
 * before allowing an upload. Provider-aware and never silently falls back:
 * "local" is unavailable on Vercel's ephemeral filesystem, and "vercel-blob"
 * and "r2" are each unavailable until their own credentials are actually
 * present.
 */
export function isMediaUploadAvailable(): boolean {
  const provider = getStorageProvider();
  if (provider === "local") return !isEphemeralFilesystemEnvironment();
  if (provider === "vercel-blob") return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  if (provider === "r2") return r2Config() !== null;
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

/**
 * Cloudflare R2 over its S3-compatible API.
 *
 * The client is built per call rather than held in a module-level
 * singleton: these run in serverless functions that are frozen and thawed
 * between invocations, and a long-lived socket pool across that boundary is
 * a source of stale-connection errors. Construction is cheap; the
 * connection is not reused across invocations anyway.
 *
 * region "auto" is what R2 expects — it has no regions in the S3 sense, but
 * the SigV4 signer requires the field to be set to something.
 *
 * Reads never go through this adapter or through R2's API: objects are
 * served directly from the bucket's public base URL, which is why R2's zero
 * egress fee applies to essentially all of the traffic.
 */
async function saveUploadR2(file: File, ext: string): Promise<SavedUpload> {
  const cfg = r2Config();
  if (!cfg) throw new StorageNotAvailableError("R2 is selected but its credentials are incomplete.");

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });

  const key = uploadKey(ext);
  await s3.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type,
      // Long, immutable caching is safe because the key is a fresh UUID on
      // every upload — a given key's bytes never change.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return { url: `${cfg.publicBaseUrl}/${key}` };
}

async function deleteUploadR2(url: string): Promise<void> {
  const cfg = r2Config();
  if (!cfg) return;
  // Only ever delete something this adapter wrote: derive the key from our
  // own public base URL and refuse anything that doesn't start with it,
  // rather than trusting an arbitrary URL to name an object in the bucket.
  if (!url.startsWith(`${cfg.publicBaseUrl}/`)) return;
  const key = url.slice(cfg.publicBaseUrl.length + 1);
  if (!key.startsWith("uploads/")) return;

  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  // Matches the other adapters: a failed delete must never break the
  // editorial action that triggered it.
  await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key })).catch(() => {});
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
  if (provider === "r2") return saveUploadR2(file, ext);
  throw new StorageNotAvailableError(`Storage provider "${provider}" has no adapter implemented.`);
}

export async function deleteUpload(url: string): Promise<void> {
  const provider = getStorageProvider();
  if (provider === "local") return deleteUploadLocal(url);
  if (provider === "vercel-blob") return deleteUploadVercelBlob(url);
  if (provider === "r2") return deleteUploadR2(url);
  // Unknown provider — nothing we can safely delete from.
}
