import { decode, encode } from 'fast-png';

export type Mask = { x: number; y: number; width: number; height: number };
export function maskBetween(x1: number, y1: number, x2: number, y2: number): Mask {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const left = clamp(Math.min(x1, x2)), top = clamp(Math.min(y1, y2));
  return { x: left, y: top, width: clamp(Math.max(x1, x2)) - left, height: clamp(Math.max(y1, y2)) - top };
}

// Replace actual pixels, then encode a fresh PNG without the source's metadata. The original image
// is never embedded under a PDF overlay. Only native-rendered 8-bit RGB(A) pages are accepted.
export function redactPng(bytes: Uint8Array, masks: Mask[]): Uint8Array {
  const image = decode(bytes, { checkCrc: true });
  const { width, height, channels, depth } = image;
  if (depth !== 8 || (channels !== 3 && channels !== 4) || width * height > 16_000_000) throw new Error('Unsupported page image');
  const data = new Uint8Array(image.data);
  for (const mask of masks) {
    if (![mask.x, mask.y, mask.width, mask.height].every(Number.isFinite) || mask.width <= 0 || mask.height <= 0) throw new Error('Invalid redaction');
    // Round outward, plus one pixel to avoid exposing anti-aliased text at the edge.
    const left = Math.max(0, Math.floor(mask.x * width) - 1), top = Math.max(0, Math.floor(mask.y * height) - 1);
    const right = Math.min(width, Math.ceil((mask.x + mask.width) * width) + 1), bottom = Math.min(height, Math.ceil((mask.y + mask.height) * height) + 1);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const at = (y * width + x) * channels;
      data[at] = data[at + 1] = data[at + 2] = 0;
      if (channels === 4) data[at + 3] = 255;
    }
  }
  return encode({ width, height, channels, depth: 8, data });
}

// Only already-redacted PNG data goes into this HTML; no original PDF, text, links or metadata.
export function privatePdfHtml(images: string[]): string {
  if (!images.length || images.some(s => !/^[A-Za-z0-9+/=]+$/.test(s))) throw new Error('Invalid page data');
  return `<html><head><style>@page{size:A4;margin:0}html,body{margin:0;padding:0}.page{width:794px;height:1122px;display:flex;align-items:center;justify-content:center;break-after:page;overflow:hidden}.page:last-child{break-after:auto}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body>${images.map(s => `<div class="page"><img src="data:image/png;base64,${s}"/></div>`).join('')}</body></html>`;
}
