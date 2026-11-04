/**
 * @module server/services/imageSize
 *
 * Reads an image's pixel size from its header, with no image library. Used to ask a model
 * for an output with the same aspect ratio as the photo it was given.
 */

export interface Size {
  width: number;
  height: number;
}

const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const le24 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

function png(b: Uint8Array): Size | null {
  // 8-byte signature, then the IHDR chunk: length(4) "IHDR"(4) width(4) height(4)
  if (b.length < 24 || b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  return { width: be32(b, 16), height: be32(b, 20) };
}

function jpeg(b: Uint8Array): Size | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue; // fill byte
    }
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = be16(b, i + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) hold the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: be16(b, i + 5), width: be16(b, i + 7) };
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function webp(b: Uint8Array): Size | null {
  if (b.length < 30) return null;
  const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (tag === 'VP8X') return { width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
  if (tag === 'VP8 ') {
    // Lossy: frame tag(3) start code 9d 01 2a, then 14-bit width and height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (tag === 'VP8L') {
    // Lossless: signature 0x2f, then 14-bit width-1 and height-1 packed little-endian.
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** The pixel size of a PNG, JPEG or WebP, or null if it cannot be read. */
export function imageSize(bytes: Uint8Array): Size | null {
  let size: Size | null = null;
  if (bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50) size = png(bytes);
  else if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) size = jpeg(bytes);
  else if (bytes.length > 12 && bytes[0] === 0x52 && bytes[8] === 0x57) size = webp(bytes);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

/**
 * A "WxH" string with the same aspect ratio as `from`, scaled so its longest side is
 * `longSide`. The API only uses it as an aspect ratio. Null when the size is unknown.
 */
export function sizeStringLike(from: Size | null, longSide: number): string | null {
  if (!from) return null;
  const scale = longSide / Math.max(from.width, from.height);
  const w = Math.max(1, Math.round(from.width * scale));
  const h = Math.max(1, Math.round(from.height * scale));
  return `${w}x${h}`;
}
