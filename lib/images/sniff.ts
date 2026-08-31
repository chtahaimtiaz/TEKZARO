/**
 * Minimal, self-contained image format + dimension sniffer for exactly the
 * 4 formats this project allows (JPEG/PNG/WEBP/GIF — no SVG, same XSS
 * reasoning as lib/media/storage.ts). Hand-rolled deliberately, not backed
 * by the `image-size` package: that package has two open, unpatched
 * high-severity DoS advisories (infinite loops in its ICNS and JXL/HEIF
 * parsers — GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq) and this function's
 * entire purpose is to run on untrusted, attacker-reachable bytes fetched
 * from arbitrary third-party sites — exactly the input a DoS-vulnerable
 * parser must never see. Every code path below is either a fixed-offset
 * read or a loop with a strictly-increasing position and an explicit
 * iteration cap, so it cannot hang regardless of what bytes it's given.
 *
 * Doubles as the "validate the actual downloaded bytes, don't trust the
 * URL or Content-Type header" check: if this can't identify a real,
 * well-formed header for one of the 4 allowed formats, the content is
 * rejected outright by the caller.
 */

export interface SniffedImage {
  format: "jpeg" | "png" | "webp" | "gif";
  width?: number;
  height?: number;
}

export function sniffImage(bytes: Buffer): SniffedImage | null {
  return sniffPng(bytes) ?? sniffGif(bytes) ?? sniffWebp(bytes) ?? sniffJpeg(bytes);
}

function sniffPng(bytes: Buffer): SniffedImage | null {
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(SIGNATURE)) return null;
  // IHDR is always the first chunk, at a fixed offset — no loop needed.
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return { format: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function sniffGif(bytes: Buffer): SniffedImage | null {
  if (bytes.length < 10) return null;
  const header = bytes.toString("ascii", 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  return { format: "gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

function sniffWebp(bytes: Buffer): SniffedImage | null {
  if (bytes.length < 30) return null;
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  const subFormat = bytes.toString("ascii", 12, 16);

  if (subFormat === "VP8X") {
    // Extended format: 24-bit little-endian (width-1)/(height-1) at a fixed offset.
    const w = bytes.readUIntLE(24, 3) + 1;
    const h = bytes.readUIntLE(27, 3) + 1;
    return { format: "webp", width: w, height: h };
  }
  if (subFormat === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    // Lossless: a 1-byte signature (0x2F) then 14-bit (width-1)/(height-1) packed big-endian-ish across 4 bytes.
    const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
    const w = 1 + (((b1 & 0x3f) << 8) | b0);
    const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { format: "webp", width: w, height: h };
  }
  if (subFormat === "VP8 ") {
    // Lossy: real dimensions live inside the VP8 keyframe bitstream, which
    // needs format-specific bit-level decoding beyond a header read.
    // Deliberately not implemented (scope trim, not a security gap — format
    // validation above already confirms this is a genuine WebP file);
    // dimensions come back unknown and ranking treats that neutrally.
    return { format: "webp" };
  }
  return null;
}

function sniffJpeg(bytes: Buffer): SniffedImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  // Marker-segment scan: each iteration reads one segment's declared length
  // and jumps forward by at least that many bytes, so `pos` is strictly
  // increasing every iteration — bounded by bytes.length iterations in the
  // worst case. The explicit cap below is defense-in-depth on top of that
  // structural guarantee, not the only thing preventing a hang.
  let pos = 2;
  const maxIterations = bytes.length; // generous, still a hard ceiling
  for (let i = 0; i < maxIterations && pos + 4 <= bytes.length; i++) {
    if (bytes[pos] !== 0xff) { pos += 1; continue; } // resync on padding bytes
    const marker = bytes[pos + 1];
    // SOF0-SOF15 except DHT(C4)/JPG(C8)/DAC(CC) carry the real dimensions.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (pos + 9 > bytes.length) return null;
      return { format: "jpeg", height: bytes.readUInt16BE(pos + 5), width: bytes.readUInt16BE(pos + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2; // markers with no length field
      continue;
    }
    const segmentLength = bytes.readUInt16BE(pos + 2);
    if (segmentLength < 2) return null; // malformed; never loop forever on it
    pos += 2 + segmentLength;
  }
  return { format: "jpeg" }; // valid JPEG signature, but no SOF found within the buffer — dimensions unknown
}
