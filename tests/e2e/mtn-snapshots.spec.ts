import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { parseMtn } from '../../src/utils/mtn.js';

const MTN_DIR = path.resolve(process.cwd(), 'src/assets/mtn');
const OUTPUT_DIR = path.resolve(process.cwd(), 'java/mtn');

const EXPECTED_HASHES: Record<string, string> = {
  'ICE001.MTN': '04dd31e448df9ea3f16a4771e377af4ceadd786e73256f16373e2afc6ccaba37',
  'ICE002.MTN': '2a28b1633967a93ea8aab09c189a32707c288df33ebfca09e665589d467306bf',
  'ICE003.MTN': 'fd51c86cb30c2d2509dbbb407b07dc1799a56163bab536ca68d41e0b9c48d07a',
  'ROCK001.MTN': 'c40f351055ef3be616e37d0afaf2bd3835321b1952d41416955bb813947b0a39',
  'ROCK002.MTN': 'b5c3c8205dc8660eec7f56dcc1022787f9ce94360073370ac7006ecac77bf0ef',
  'ROCK003.MTN': '1f30de5f8de667f93b5a378c237eb81876e73df999e86bb75bb09231ba090d68',
  'ROCK004.MTN': 'f71301e73423ad6a83b353c33b7b6d9e484fb38545037fd6fa3480f9ff8884a1',
  'ROCK005.MTN': 'd8514a98df2fa492efa4803138813558e713e10dba2f7b818443ae2da1d56461',
  'ROCK006.MTN': 'a900d74384e9a85d156380e38fe01c1c9d4c2133e532ef880a097c2b5f49ecf1',
  'SNOW001.MTN': '65f255c89dd8cb7711b41fd854296da7f69ad3c43a55df099bbf966a1782f6dc',
};

function flattenPixels(pixels: number[][], width: number, height: number): Uint8Array {
  const flat = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      flat[y * width + x] = pixels[y][x] & 0x0f;
    }
  }
  return flat;
}

function parsedHash(width: number, height: number, columns: number[][]): string {
  const hash = crypto.createHash('sha256');
  hash.update(Uint16Array.from([width, height]));
  for (const column of columns) {
    hash.update(Uint8Array.from(column));
  }
  return hash.digest('hex');
}

const files = fs
  .readdirSync(MTN_DIR)
  .filter((name) => name.toUpperCase().endsWith('.MTN'))
  .sort();

test.describe('MTN decoding snapshots', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const fileName of files) {
    test(`decode and snapshot ${fileName}`, async ({ page }) => {
      const filePath = path.join(MTN_DIR, fileName);
      const parsed = parseMtn(fs.readFileSync(filePath));

      expect(parsed.trailingBytes).toBe(0);
      expect(parsed.width).toBe(parsed.headerWords[0]);
      expect(parsed.height).toBe(parsed.headerWords[2] + 1);
      expect(parsed.palette).toHaveLength(16);
      expect(parsedHash(parsed.width, parsed.height, parsed.columns)).toBe(EXPECTED_HASHES[fileName]);

      const flatPixels = flattenPixels(parsed.pixels, parsed.width, parsed.height);

      await page.setViewportSize({
        width: Math.max(320, parsed.width + 20),
        height: Math.max(240, parsed.height + 20),
      });

      await page.setContent(`<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;background:#000;display:grid;place-items:center;min-height:100vh;">
  <canvas id="mtn"></canvas>
</body>
</html>`);

      await page.evaluate(
        ({ width, height, palette, pixels }) => {
          const canvas = document.getElementById('mtn');
          if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error('Canvas not found');
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('2d context not available');
          }

          const image = ctx.createImageData(width, height);
          const data = image.data;

          for (let i = 0; i < pixels.length; i += 1) {
            const idx = pixels[i] & 0x0f;
            const color = palette[idx] ?? [0, 0, 0];
            const out = i * 4;
            data[out] = color[0] ?? 0;
            data[out + 1] = color[1] ?? 0;
            data[out + 2] = color[2] ?? 0;
            data[out + 3] = 255;
          }

          ctx.putImageData(image, 0, 0);
        },
        {
          width: parsed.width,
          height: parsed.height,
          palette: parsed.palette,
          pixels: Array.from(flatPixels),
        },
      );

      const outputPath = path.join(OUTPUT_DIR, `${path.parse(fileName).name}.jpg`);
      await page.locator('#mtn').screenshot({
        path: outputPath,
        type: 'jpeg',
        quality: 95,
      });

      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(2000);
    });
  }
});
