import { describe, it, expect, vi, afterEach } from "vitest";
import { safeFetchBinary, UnsafeUrlError, ResponseTooLargeError } from "../lib/security/safe-fetch";

describe("safeFetchBinary — protocol and address validation (no network involved)", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(safeFetchBinary("ftp://example.com/file")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetchBinary("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects IP-literal private/loopback addresses outright", async () => {
    await expect(safeFetchBinary("http://127.0.0.1/")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetchBinary("http://10.0.0.5/")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetchBinary("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects localhost by name", async () => {
    await expect(safeFetchBinary("http://localhost/photo.jpg")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects an unparsable URL", async () => {
    await expect(safeFetchBinary("not a url")).rejects.toThrow(UnsafeUrlError);
  });
});

describe("safeFetchBinary — network behavior (mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("follows a redirect only after re-validating the target, and refuses a redirect into a private address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetchBinary("https://example.com/redirector")).rejects.toThrow(UnsafeUrlError);
  });

  it("caps response size and aborts rather than buffering unbounded data — same 5MB cap as safeFetch", async () => {
    const bigChunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(bigChunk);
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetchBinary("https://example.com/huge-image.jpg")).rejects.toThrow(ResponseTooLargeError);
  });

  it("returns raw bytes as a Buffer, not decoded/mangled as text", async () => {
    // Bytes that are not valid UTF-8 on their own — proves the binary path
    // doesn't round-trip through a lossy string decode the way safeFetch's
    // .text does.
    const rawBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(rawBytes, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await safeFetchBinary("https://example.com/photo.jpg");
    expect(Buffer.isBuffer(result.bytes)).toBe(true);
    expect([...result.bytes]).toEqual([...rawBytes]);
  });
});

describe("safeFetchBinary — real network happy path", () => {
  it("successfully fetches a known-stable public URL and preserves byte fidelity", async () => {
    const result = await safeFetchBinary("https://example.com/");
    expect(result.status).toBe(200);
    expect(Buffer.isBuffer(result.bytes)).toBe(true);
    expect(result.bytes.toString("utf-8").toLowerCase()).toContain("example domain");
  });
});
