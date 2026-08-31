import { describe, it, expect, afterEach, vi } from "vitest";

// Hoisted above imports by vitest's transform — the static import of
// lib/media/storage below sees this mocked @vercel/blob, so no real network
// call to Vercel's Blob API is ever attempted.
const putMock = vi.fn(async (pathname: string) => ({
  url: `https://fake-store-id.public.blob.vercel-storage.com/${pathname}`,
  downloadUrl: `https://fake-store-id.public.blob.vercel-storage.com/${pathname}?download=1`,
  pathname,
  contentType: "image/png",
  contentDisposition: `attachment; filename="${pathname}"`,
}));
const delMock = vi.fn(async () => undefined);
vi.mock("@vercel/blob", () => ({
  put: putMock,
  del: delMock,
}));

const {
  saveUpload,
  deleteUpload,
  isMediaUploadAvailable,
  UnsupportedFileTypeError,
  FileTooLargeError,
  StorageNotAvailableError,
} = await import("../lib/media/storage");

function makeFile(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("media storage — Vercel Blob adapter (mocked SDK)", () => {
  const originalProvider = process.env.STORAGE_PROVIDER;
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    putMock.mockClear();
    delMock.mockClear();
    if (originalProvider === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = originalProvider;
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it("is unavailable without BLOB_READ_WRITE_TOKEN, even off Vercel", () => {
    process.env.STORAGE_PROVIDER = "vercel-blob";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(isMediaUploadAvailable()).toBe(false);
  });

  it("saveUpload throws a clear StorageNotAvailableError when the token is missing, without calling the SDK", async () => {
    process.env.STORAGE_PROVIDER = "vercel-blob";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const file = makeFile("photo.png", "image/png", 1024);
    await expect(saveUpload(file, "article")).rejects.toBeInstanceOf(StorageNotAvailableError);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("is available on Vercel once the token is set", () => {
    process.env.VERCEL = "1";
    process.env.STORAGE_PROVIDER = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token-for-tests";
    expect(isMediaUploadAvailable()).toBe(true);
  });

  it("uploads via put() with access:public and returns the canonical URL", async () => {
    process.env.STORAGE_PROVIDER = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token-for-tests";

    const file = makeFile("photo.png", "image/png", 1024);
    const result = await saveUpload(file, "article");

    const keyPattern = /^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/; // no leading slash
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith(
      expect.stringMatching(keyPattern),
      expect.anything(),
      expect.objectContaining({ access: "public", contentType: "image/png" }),
    );
    expect(result.url).toMatch(/^https:\/\/fake-store-id\.public\.blob\.vercel-storage\.com\/uploads\//);
  });

  it("still enforces MIME validation on the Blob path (the shared validateUpload fix)", async () => {
    process.env.STORAGE_PROVIDER = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token-for-tests";
    const file = makeFile("evil.svg", "image/svg+xml", 100);
    await expect(saveUpload(file, "article")).rejects.toBeInstanceOf(UnsupportedFileTypeError);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("still enforces the size cap on the Blob path", async () => {
    process.env.STORAGE_PROVIDER = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token-for-tests";
    const file = makeFile("huge.jpg", "image/jpeg", 5 * 1024 * 1024); // over the 4MB cap
    await expect(saveUpload(file, "article")).rejects.toBeInstanceOf(FileTooLargeError);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("deletes via del() with the stored canonical URL, no key reconstruction", async () => {
    process.env.STORAGE_PROVIDER = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token-for-tests";
    const url = "https://fake-store-id.public.blob.vercel-storage.com/uploads/2026/08/x.png";
    await deleteUpload(url);
    expect(delMock).toHaveBeenCalledWith(url);
  });

  it("deleteUpload is a no-op (never throws) when the token is missing", async () => {
    process.env.STORAGE_PROVIDER = "vercel-blob";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await expect(deleteUpload("https://fake-store-id.public.blob.vercel-storage.com/x.png")).resolves.toBeUndefined();
    expect(delMock).not.toHaveBeenCalled();
  });
});
