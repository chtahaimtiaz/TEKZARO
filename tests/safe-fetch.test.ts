import { describe, it, expect, vi, afterEach } from "vitest";
import { safeFetch, UnsafeUrlError, ResponseTooLargeError } from "../lib/security/safe-fetch";

describe("safeFetch — protocol and address validation (no network involved)", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(safeFetch("ftp://example.com/file")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects IP-literal private/loopback addresses outright", async () => {
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetch("http://10.0.0.5/")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(UnsafeUrlError); // cloud metadata endpoint
    await expect(safeFetch("http://[::1]/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects localhost by name", async () => {
    await expect(safeFetch("http://localhost/")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetch("http://foo.localhost/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects an unparsable URL", async () => {
    await expect(safeFetch("not a url")).rejects.toThrow(UnsafeUrlError);
  });
});

describe("safeFetch — network behavior (mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("follows a redirect only after re-validating the target, and refuses a redirect into a private address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetch("https://example.com/redirector")).rejects.toThrow(UnsafeUrlError);
  });

  it("caps response size and aborts rather than buffering unbounded data", async () => {
    const bigChunk = new Uint8Array(1024 * 1024); // 1MB per chunk
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        // Push far more than the 5MB cap.
        for (let i = 0; i < 10; i++) controller.enqueue(bigChunk);
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetch("https://example.com/huge-feed")).rejects.toThrow(ResponseTooLargeError);
  });
});

describe("safeFetch — real network happy path", () => {
  it("successfully fetches a known-stable public URL", async () => {
    const result = await safeFetch("https://example.com/");
    expect(result.status).toBe(200);
    expect(result.text.toLowerCase()).toContain("example domain");
  });
});
