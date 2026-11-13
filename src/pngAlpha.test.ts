import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zlibSync } from 'fflate';
import { isCutout, pngAlpha } from './pngAlpha.ts';

// A minimal PNG (CRCs are not checked). `alpha(x, y)` gives each pixel's alpha; rows use filter `filter`.
function png(w: number, h: number, alpha: (x: number, y: number) => number, colour = 6, filter = 0): Uint8Array {
  const bpp = colour === 6 ? 4 : 3;
  const raw = new Uint8Array(h * (w * bpp + 1));
  for (let y = 0; y < h; y++) {
    const at = y * (w * bpp + 1);
    raw[at] = filter;
    for (let x = 0; x < w; x++) {
      const px = [200, 100, 50, alpha(x, y)].slice(0, bpp);
      // Filter 1 (Sub) stores each byte minus the one a pixel to the left.
      px.forEach((v, i) => {
        const left = x > 0 ? [200, 100, 50, alpha(x - 1, y)][i] : 0;
        raw[at + 1 + x * bpp + i] = filter === 1 ? (v - left + 256) % 256 : v;
      });
    }
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, colour, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (all.set(p, at), at + p.length), 0);
  return all;
}

const centre = (x: number, y: number) => (x >= 8 && x < 24 && y >= 8 && y < 24 ? 255 : 0);

test('a product on a transparent background is a cut-out', () => {
  const a = pngAlpha(png(32, 32, centre));
  assert.deepEqual(a, { border: 1, solid: 0.25 });
  assert.ok(isCutout(a));
});

test('filtered rows decode the same', () => {
  assert.deepEqual(pngAlpha(png(32, 32, centre, 6, 1)), { border: 1, solid: 0.25 });
});

test('photos, empty frames and non-PNGs are not cut-outs', () => {
  assert.ok(!isCutout(pngAlpha(png(32, 32, () => 255)))); // alpha channel but opaque everywhere
  assert.deepEqual(pngAlpha(png(16, 16, () => 255, 2)), { border: 0, solid: 1 }); // no alpha channel
  assert.ok(!isCutout(pngAlpha(png(32, 32, () => 0)))); // nothing to show
  assert.equal(pngAlpha(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)])), null); // a JPEG
});
