// ZIP STORE: portable claim packages without another native dependency.
const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let j = 0; j < 8; j++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
export function zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array {
  if (files.length > 1000) throw new Error('Too many files');
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name.replace(/[\\/]/g, '-'));
    let crc = 0xffffffff;
    for (const b of file.data) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 255];
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
    h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
    h.setUint32(18, file.data.length, true); h.setUint32(22, file.data.length, true); h.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header, file.data);
    const entry = new Uint8Array(46 + name.length), c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, file.data.length, true); c.setUint32(24, file.data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); entry.set(name, 46);
    central.push(entry); offset += header.length + file.data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, size, true); e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + size + end.length);
  let pos = 0;
  for (const chunk of [...local, ...central, end]) { result.set(chunk, pos); pos += chunk.length; }
  return result;
}
