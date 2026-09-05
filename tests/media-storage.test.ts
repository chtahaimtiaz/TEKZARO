import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  saveUpload,
  deleteUpload,
  isMediaUploadAvailable,
  isEphemeralFilesystemEnvironment,
  getStorageProvider,
  UnsupportedFileTypeError,
  FileTooLargeError,
} from "../lib/media/storage";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");
const savedUrls: string[] = [];

// This suite exercises the LOCAL disk adapter specifically, so it pins the
// provider instead of inheriting whatever the ambient environment sets.
// Without this a developer .env carrying STORAGE_PROVIDER=r2 silently
// redirects these tests at the real production bucket — they then fail on
// the URL-shape assertions, but only after having written junk objects into
// it. Tests that touch storage must name the adapter they mean.
const STORAGE_ENV = [
  "STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "BLOB_READ_WRITE_TOKEN",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of STORAGE_ENV) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.env.STORAGE_PROVIDER = "local";
});

afterEach(async () => {
  // Cleanup runs while the local provider is still pinned, so deleteUpload
  // targets the same adapter that wrote the file.
  for (const url of savedUrls) {
    await deleteUpload(url);
  }
  savedUrls.length = 0;
  for (const k of STORAGE_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function makeFile(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("media storage — local adapter", () => {
  it("rejects an unsupported MIME type", async () => {
    const file = makeFile("evil.svg", "image/svg+xml", 100);
    await expect(saveUpload(file, "article")).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it("rejects a file over the size cap", async () => {
    const file = makeFile("huge.jpg", "image/jpeg", 9 * 1024 * 1024);
    await expect(saveUpload(file, "article")).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it("saves a valid image and returns a /uploads/ URL with a UUID filename, ignoring the client-supplied name", async () => {
    const file = makeFile("../../../etc/passwd.jpg", "image/jpeg", 1024);
    const result = await saveUpload(file, "article");
    savedUrls.push(result.url);

    expect(result.url).toMatch(/^\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    // The malicious original filename never appears anywhere in the saved path.
    expect(result.url).not.toContain("etc");
    expect(result.url).not.toContain("..");
  });

  it("deleteUpload actually removes the file from disk", async () => {
    const file = makeFile("photo.png", "image/png", 512);
    const result = await saveUpload(file, "article");
    const [, , yyyy, mm] = result.url.split("/");
    const dir = path.join(UPLOADS_ROOT, yyyy, mm);
    const before = await readdir(dir);
    expect(before.some((f) => result.url.endsWith(f))).toBe(true);

    await deleteUpload(result.url);
    const after = await readdir(dir);
    expect(after.some((f) => result.url.endsWith(f))).toBe(false);
  });

  it("deleteUpload ignores a URL outside the uploads directory (path-traversal guard)", async () => {
    // Should resolve to a no-op rather than throwing or touching anything
    // outside public/uploads, even given a maliciously crafted path.
    await expect(deleteUpload("/uploads/../../../etc/passwd")).resolves.toBeUndefined();
    await expect(deleteUpload("/not-uploads/file.jpg")).resolves.toBeUndefined();
  });
});

describe("media storage — Vercel ephemeral-filesystem guard", () => {
  const originalVercel = process.env.VERCEL;
  const originalProvider = process.env.STORAGE_PROVIDER;
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalProvider === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = originalProvider;
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  });

  it("is available locally (VERCEL unset, STORAGE_PROVIDER=local)", () => {
    delete process.env.VERCEL;
    process.env.STORAGE_PROVIDER = "local";
    expect(isEphemeralFilesystemEnvironment()).toBe(false);
    expect(getStorageProvider()).toBe("local");
    expect(isMediaUploadAvailable()).toBe(true);
  });

  it("is BLOCKED on Vercel with no durable provider configured", () => {
    process.env.VERCEL = "1";
    process.env.STORAGE_PROVIDER = "local";
    expect(isEphemeralFilesystemEnvironment()).toBe(true);
    expect(isMediaUploadAvailable()).toBe(false);
  });

  it("saveUpload throws StorageNotAvailableError when blocked on Vercel", async () => {
    process.env.VERCEL = "1";
    process.env.STORAGE_PROVIDER = "local";
    const file = makeFile("photo.jpg", "image/jpeg", 512);
    await expect(saveUpload(file, "article")).rejects.toThrow(/durable object storage/i);
  });

  it("is available on Vercel once STORAGE_PROVIDER=vercel-blob and a token is configured", () => {
    process.env.VERCEL = "1";
    process.env.STORAGE_PROVIDER = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token-for-tests";
    expect(isMediaUploadAvailable()).toBe(true);
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("stays unavailable on Vercel for an unimplemented provider value, even off the ephemeral-FS guard", () => {
    process.env.VERCEL = "1";
    process.env.STORAGE_PROVIDER = "s3"; // no adapter exists for this — never treated as available
    expect(isMediaUploadAvailable()).toBe(false);
  });
});
