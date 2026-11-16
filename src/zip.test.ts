import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipFiles } from './zip.ts';
test('claim ZIP stores exact document bytes, CRC and UTF-8 names with central directory offsets', () => {
  const zip = zipFiles([{ name: 'claim.txt', data: new TextEncoder().encode('123456789') }, { name: 'bizonylat-ő.pdf', data: new Uint8Array([0, 255, 80, 68, 70]) }]);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0xcbf43926);
  assert.equal(view.getUint16(6, true), 0x800);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  const central = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.equal(view.getUint32(central + 42, true), 0);
  const second = central + 46 + view.getUint16(central + 28, true);
  const offset = view.getUint32(second + 42, true);
  const nameLength = view.getUint16(offset + 26, true);
  assert.equal(new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLength)), 'bizonylat-ő.pdf');
  assert.deepEqual([...zip.slice(offset + 30 + nameLength, offset + 35 + nameLength)], [0, 255, 80, 68, 70]);
});
test('ZIP refuses excessive entries and strips path separators', () => {
  assert.throws(() => zipFiles(Array.from({length:1001}, () => ({name:'x',data:new Uint8Array()}))));
  const zip = zipFiles([{ name: '../a/b.pdf', data: new Uint8Array() }]);
  assert.equal(new TextDecoder().decode(zip.slice(30, 40)), '..-a-b.pdf');
});
