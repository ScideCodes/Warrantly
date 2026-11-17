import makeQr from 'qrcode-generator';

// QR sticker for the item itself: scanning it with the phone camera, or with Scan sticker in the app, opens
// this warranty. The link only means something on a phone that holds the record (ids are per phone).
export const stickerLink = (id: number): string => `warrantly://warranty/${id}`;

// The warranty id behind a scanned sticker, or null for any other code.
export function stickerId(data: string): number | null {
  const m = /^warrantly:\/\/warranty\/(\d+)$/.exec(data.trim());
  return m ? Number(m[1]) : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function stickerHtml(id: number, product: string, endLine: string, hint: string): string {
  const qr = makeQr(0, 'M');
  qr.addData(stickerLink(id));
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  // One 50 mm label with a cut line, at the top left so it fits sticker sheets and plain paper alike.
  return `<html><body style="margin:12mm;font-family:sans-serif">
<div style="width:50mm;padding:4mm;border:0.3mm dashed #999;border-radius:3mm;text-align:center">
<div style="width:34mm;height:34mm;margin:0 auto">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div>
<div style="font-size:11pt;font-weight:600;margin-top:2mm;overflow-wrap:anywhere">${esc(product)}</div>
<div style="font-size:9pt;margin-top:1mm">${esc(endLine)}</div>
<div style="font-size:7pt;color:#555;margin-top:1mm">${esc(hint)}</div>
</div></body></html>`;
}
