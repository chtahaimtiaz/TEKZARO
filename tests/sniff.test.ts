import { describe, it, expect } from "vitest";
import { sniffImage } from "../lib/images/sniff";
import { buildMinimalPng, buildMinimalGif, buildMinimalJpeg, buildMinimalWebpVP8X } from "./helpers";

describe("sniffImage", () => {
  it("reads real width/height from a PNG's IHDR chunk", () => {
    expect(sniffImage(buildMinimalPng(800, 450))).toEqual({ format: "png", width: 800, height: 450 });
  });

  it("reads real width/height from a GIF header", () => {
    expect(sniffImage(buildMinimalGif(320, 240))).toEqual({ format: "gif", width: 320, height: 240 });
  });

  it("reads real width/height from a JPEG SOF0 segment", () => {
    expect(sniffImage(buildMinimalJpeg(1200, 675))).toEqual({ format: "jpeg", width: 1200, height: 675 });
  });

  it("reads real width/height from a WebP VP8X (extended) header", () => {
    expect(sniffImage(buildMinimalWebpVP8X(800, 450))).toEqual({ format: "webp", width: 800, height: 450 });
  });

  it("skips DHT/DAC/JPG markers when scanning for JPEG's real SOF marker", () => {
    // FFD8, then a DHT marker (C4) with a 4-byte segment (length includes
    // itself: 2 length bytes + 2 payload bytes), then the real SOF0.
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x04, 0xaa, 0xbb]),
      buildMinimalJpeg(640, 480).subarray(2), // reuse the SOF0 segment built above, minus its own SOI
    ]);
    const result = sniffImage(buf);
    expect(result).toEqual({ format: "jpeg", width: 640, height: 480 });
  });

  it("returns a format with unknown dimensions for a JPEG with no SOF in the buffer", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // SOI immediately followed by EOI, no SOF
    expect(sniffImage(buf)).toEqual({ format: "jpeg" });
  });

  it("returns format-only (no dimensions) for a lossy VP8 WebP, a deliberate scope trim", () => {
    const buf = Buffer.alloc(30);
    buf.write("RIFF", 0, "ascii");
    buf.write("WEBP", 8, "ascii");
    buf.write("VP8 ", 12, "ascii");
    expect(sniffImage(buf)).toEqual({ format: "webp" });
  });

  it("returns null for content that isn't any of the 4 allowed formats", () => {
    expect(sniffImage(Buffer.from("not an image, just text"))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
    // A real, valid ICNS/JXL/HEIF-style header would also land here — this
    // sniffer recognizes only JPEG/PNG/WEBP/GIF, full stop.
    expect(sniffImage(Buffer.from([0x00, 0x00, 0x01, 0x00]))).toBeNull(); // .ico magic, not supported
  });

  it("never throws or hangs on truncated/malformed bytes claiming to be each format", () => {
    const truncatedPng = buildMinimalPng(100, 100).subarray(0, 15);
    const truncatedGif = buildMinimalGif(100, 100).subarray(0, 7);
    const truncatedWebp = buildMinimalWebpVP8X(100, 100).subarray(0, 20);
    const jpegWithLyingSegmentLength = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]); // segment length < 2
    for (const buf of [truncatedPng, truncatedGif, truncatedWebp, jpegWithLyingSegmentLength]) {
      expect(() => sniffImage(buf)).not.toThrow();
    }
  });

  it("terminates on a JPEG built entirely of padding/resync bytes, never looping forever", () => {
    // Every byte after SOI is 0x00 (not a real marker) — the scanner must
    // resync one byte at a time and terminate within a bounded number of
    // iterations rather than loop indefinitely.
    const buf = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(5000, 0x00)]);
    const start = Date.now();
    const result = sniffImage(buf);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result).toEqual({ format: "jpeg" });
  });
});
