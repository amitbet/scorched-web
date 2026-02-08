function asUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('parseMtn expects a Uint8Array, ArrayBuffer, or TypedArray');
}

function readU16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function inferHeightMinusOne(headerWords, maxColumnLength) {
  const candidates = headerWords.slice(1).filter((value) => value >= maxColumnLength - 1 && value <= 4095);
  if (candidates.length === 0) {
    return Math.max(0, maxColumnLength - 1);
  }

  candidates.sort((a, b) => Math.abs((a + 1) - maxColumnLength) - Math.abs((b + 1) - maxColumnLength));
  return candidates[0];
}

function decodeNibbles(bytes, offset, nibbleCount) {
  const paddedNibbleCount = nibbleCount + (nibbleCount % 2);
  const byteCount = paddedNibbleCount / 2;
  const out = new Array(nibbleCount);

  let write = 0;
  for (let i = 0; i < byteCount; i += 1) {
    const value = bytes[offset + i];
    const high = (value >> 4) & 0x0f;
    const low = value & 0x0f;

    if (write < nibbleCount) out[write++] = high;
    if (write < nibbleCount) out[write++] = low;
  }

  return { values: out, bytesRead: byteCount };
}

/**
 * Parse a Scorched Earth .MTN file.
 *
 * Notes from the reverse-engineering article:
 * - Signature starts with 'MT', 0xBEEF, and version (big-endian 1)
 * - 18-byte header follows (mostly 16-bit values; several unknown/unused)
 * - Palette is 16 RGB triples (48 bytes)
 * - Pixel payload is column-major. Each column starts with a 16-bit LE nibble count,
 *   followed by packed nibbles padded to a byte boundary.
 *
 * @param {Uint8Array|ArrayBuffer|ArrayBufferView} input
 * @param {{ skyIndex?: number }} [options]
 */
export function parseMtn(input, options = {}) {
  const bytes = asUint8Array(input);
  const skyIndex = Number.isInteger(options.skyIndex) ? options.skyIndex : 0;

  if (bytes.length < 72) {
    throw new Error(`Invalid MTN file: expected at least 72 bytes, got ${bytes.length}`);
  }

  if (bytes[0] !== 0x4d || bytes[1] !== 0x54) {
    throw new Error('Invalid MTN signature: missing "MT" prefix');
  }

  const markerLE = readU16LE(bytes, 2);
  const markerBE = readU16BE(bytes, 2);
  const version = readU16BE(bytes, 4);

  if (markerLE !== 0xbeef && markerBE !== 0xbeef) {
    throw new Error(`Invalid MTN signature marker: expected 0xBEEF, got 0x${markerBE.toString(16)}`);
  }
  const marker = 0xbeef;

  const headerOffset = 6;
  const headerWords = new Array(9);
  for (let i = 0; i < 9; i += 1) {
    headerWords[i] = readU16LE(bytes, headerOffset + i * 2);
  }

  const width = headerWords[0];
  if (width <= 0) {
    throw new Error(`Invalid MTN width in header: ${width}`);
  }

  const paletteOffset = 24;
  const palette = new Array(16);
  for (let i = 0; i < 16; i += 1) {
    const base = paletteOffset + i * 3;
    palette[i] = [bytes[base], bytes[base + 1], bytes[base + 2]];
  }

  const columns = new Array(width);
  let offset = 72;

  for (let x = 0; x < width; x += 1) {
    if (offset + 2 > bytes.length) {
      throw new Error(`Unexpected EOF while reading column length at x=${x}`);
    }

    const nibbleCount = readU16LE(bytes, offset);
    offset += 2;

    const { values, bytesRead } = decodeNibbles(bytes, offset, nibbleCount);
    offset += bytesRead;

    if (offset > bytes.length) {
      throw new Error(`Unexpected EOF while reading column data at x=${x}`);
    }

    columns[x] = values;
  }

  const maxColumnLength = columns.reduce((max, col) => Math.max(max, col.length), 0);
  const heightMinusOne = inferHeightMinusOne(headerWords, maxColumnLength);
  const height = heightMinusOne + 1;

  const pixels = Array.from({ length: height }, () => Array(width).fill(skyIndex));
  for (let x = 0; x < width; x += 1) {
    const column = columns[x];
    const startY = height - column.length;

    for (let i = 0; i < column.length; i += 1) {
      const y = startY + i;
      if (y >= 0 && y < height) {
        pixels[y][x] = column[i];
      }
    }
  }

  return {
    magic: 'MT',
    marker,
    version,
    width,
    height,
    heightMinusOne,
    headerWords,
    palette,
    columns,
    pixels,
    bytesRead: offset,
    trailingBytes: bytes.length - offset,
  };
}
