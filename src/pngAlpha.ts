import { unzlibSync } from 'fflate';

// How see-through a PNG is, read from its pixels: `border` is the share of the outer frame (2 px) that is
// transparent, `solid` the share of the whole picture that is opaque. A clean product cut-out has a clear
// border and a solid product in the middle. Null when the file is not a PNG this reads (interlaced, low
// bit-depth palette, or too large); callers treat that as "not a cut-out".
export interface Alpha {
  border: number;
  solid: number;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_PIXELS = 2048 * 2048;

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

export function pngAlpha(png: Uint8Array): Alpha | null {
  if (png.length < 33 || SIGNATURE.some((v, i) => png[i] !== v)) return null;
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let i = 8; i + 8 <= png.length; ) {
    const len = u32(png, i);
    const type = String.fromCharCode(png[i + 4], png[i + 5], png[i + 6], png[i + 7]);
    const data = png.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      width = u32(data, 0);
      height = u32(data, 4);
      depth = data[8];
      colour = data[9];
      interlace = data[12];
    } else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  if (!width || !height || width * height > MAX_PIXELS || interlace !== 0) return null;

  // No alpha channel and no transparent palette entries: fully opaque, nothing to decode.
  const hasAlpha = colour === 6 || colour === 4 || (colour === 3 && trns);
  if (!hasAlpha) return colour === 0 || colour === 2 || colour === 3 ? { border: 0, solid: 1 } : null;
  if (colour === 3 ? depth !== 8 : depth !== 8 && depth !== 16) return null;

  const channels = colour === 6 ? 4 : colour === 4 ? 2 : 1;
  const bpp = (channels * depth) / 8; // bytes per pixel, the filter's step back
  const stride = width * bpp;
  let raw: Uint8Array;
  try {
    const all = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
    idat.reduce((at, c) => (all.set(c, at), at + c.length), 0);
    raw = unzlibSync(all);
  } catch {
    return null;
  }
  if (raw.length < height * (stride + 1)) return null;

  const alphaAt = (row: Uint8Array, x: number): number =>
    colour === 3 ? (trns && row[x] < trns.length ? trns[row[x]] : 255) : row[x * bpp + bpp - (depth === 16 ? 2 : 1)];

  let prev = new Uint8Array(stride);
  let frame = 0, clear = 0, solid = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) row[i] += a;
      else if (filter === 2) row[i] += b;
      else if (filter === 3) row[i] += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        row[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) return null;
    }
    const edgeRow = y < 2 || y >= height - 2;
    for (let x = 0; x < width; x++) {
      const alpha = alphaAt(row, x);
      if (alpha >= 224) solid++;
      if (edgeRow || x < 2 || x >= width - 2) {
        frame++;
        if (alpha < 32) clear++;
      }
    }
    prev = row;
  }
  return { border: clear / frame, solid: solid / (width * height) };
}

// A product on no background: a clear border, and a product that is neither a speck nor the whole frame.
export const isCutout = (a: Alpha | null): boolean => !!a && a.border >= 0.9 && a.solid >= 0.08 && a.solid <= 0.92;
