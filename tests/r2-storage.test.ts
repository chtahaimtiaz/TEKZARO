import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { isOptimizableImageSrc } from "../lib/image-src";

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"] as const;
const ALL = [...R2_VARS, "STORAGE_PROVIDER", "BLOB_READ_WRITE_TOKEN", "VERCEL"] as const;
const saved: Record<string, string | undefined> = {};

const FULL_R2 = {
  STORAGE_PROVIDER: "r2",
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "tekzaro-media",
  R2_PUBLIC_BASE_URL: "https://pub-abc123.r2.dev",
};

async function available(env: Record<string, string | undefined>) {
  for (const k of ALL) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  const { isMediaUploadAvailable } = await import("../lib/media/storage");
  return isMediaUploadAvailable();
}

beforeEach(() => {
  for (const k of ALL) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ALL) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("R2 storage provider", () => {
  it("is available once every credential is present", async () => {
    expect(await available(FULL_R2)).toBe(true);
  });

  it("is unavailable if any single credential is missing", async () => {
    // Partial configuration must never be treated as configured — that is
    // how an upload gets attempted and fails at runtime instead of the UI
    // honestly reporting storage as unavailable.
    for (const missing of R2_VARS) {
      const env: Record<string, string | undefined> = { ...FULL_R2 };
      delete env[missing];
      expect(await available(env), `should be unavailable without ${missing}`).toBe(false);
    }
  });

  it("stays available on Vercel, unlike local disk", async () => {
    // The whole reason for moving to R2: local storage is refused on
    // Vercel's ephemeral filesystem, durable object storage is not.
    expect(await available({ ...FULL_R2, VERCEL: "1" })).toBe(true);
    expect(await available({ STORAGE_PROVIDER: "local", VERCEL: "1" })).toBe(false);
  });

  it("does not treat an unknown provider as configured", async () => {
    expect(await available({ ...FULL_R2, STORAGE_PROVIDER: "dropbox" })).toBe(false);
  });
});

describe("next/image host allowlist", () => {
  it("optimizes R2 public URLs", () => {
    expect(isOptimizableImageSrc("https://pub-abc123.r2.dev/uploads/2026/09/x.jpg")).toBe(true);
  });

  it("still optimizes Vercel Blob URLs", () => {
    expect(isOptimizableImageSrc("https://abc.public.blob.vercel-storage.com/uploads/x.jpg")).toBe(true);
  });

  it("leaves third-party hosts unoptimized rather than crashing the page", () => {
    for (const src of [
      "https://fortune.com/2025/11/24/some-article/",
      "https://cdn.example.com/photo.jpg",
      "https://r2.dev.evil.com/x.jpg", // suffix-lookalike, must not match
    ]) {
      expect(isOptimizableImageSrc(src), src).toBe(false);
    }
  });

  it("treats same-origin paths as safe", () => {
    expect(isOptimizableImageSrc("/uploads/2026/09/x.jpg")).toBe(true);
  });

  it("keeps next.config and isOptimizableImageSrc in step", () => {
    // These two encode the same allowlist in different places; a host
    // trusted in one but not the other either crashes the page or silently
    // skips optimization.
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("*.r2.dev");
    expect(config).toContain("*.public.blob.vercel-storage.com");
  });
});
