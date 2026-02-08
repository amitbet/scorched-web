import { describe, expect, it } from 'vitest';
// @ts-ignore -- JS helper module has no TS declaration yet.
import { parseMtn } from './mtn.js';

function pushU16LE(target: number[], value: number): void {
  target.push(value & 0xff, (value >> 8) & 0xff);
}

describe('parseMtn', () => {
  it('parses signature, palette, and column-major nibble data', () => {
    const bytes: number[] = [];

    // Signature: 'MT', 0xBEEF, version 1 (big-endian)
    bytes.push(0x4d, 0x54, 0xef, 0xbe, 0x00, 0x01);

    // 18-byte header (9 x uint16 LE)
    const headerWords = [2, 4, 0, 0, 16, 0, 0, 0, 0];
    for (const word of headerWords) {
      pushU16LE(bytes, word);
    }

    // 16-color palette, 3 bytes each
    for (let i = 0; i < 16; i += 1) {
      bytes.push(i, i + 1, i + 2);
    }

    // Column 0: nibble count 3 => [1,2,3] + padded nibble
    pushU16LE(bytes, 3);
    bytes.push(0x12, 0x30);

    // Column 1: nibble count 4 => [4,5,6,7]
    pushU16LE(bytes, 4);
    bytes.push(0x45, 0x67);

    const parsed = parseMtn(new Uint8Array(bytes), { skyIndex: 0 });

    expect(parsed.width).toBe(2);
    expect(parsed.height).toBe(5);
    expect(parsed.columns).toEqual([
      [1, 2, 3],
      [4, 5, 6, 7],
    ]);

    expect(parsed.pixels).toEqual([
      [0, 0],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ]);
  });
});
