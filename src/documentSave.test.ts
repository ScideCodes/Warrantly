import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { saveDocumentCopy } from './documentSave.ts';

// A one-page PDF with a real cross-reference table, not just a file with a .pdf suffix.
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> >>'];
let body = '%PDF-1.4\n';
const offsets = objects.map((object, i) => { const offset = body.length; body += `${i + 1} 0 obj\n${object}\nendobj\n`; return offset; });
const xref = body.length;
body += `xref\n0 4\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const pdf = new TextEncoder().encode(body);

test('exports identical PDF bytes and repeated names keep earlier copies', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warrantly-export-'));
  try {
    const pick = async () => ({ list: () => readdirSync(dir).map((name) => ({ name })), createFile(name: string, mime: string) {
      assert.equal(mime, 'application/pdf');
      const path = join(dir, name);
      writeFileSync(path, '', { flag: 'wx' }); // creation must never overwrite an earlier export
      return { write(bytes: Uint8Array) { writeFileSync(path, bytes); }, delete() { rmSync(path); } };
    } });
    assert.equal(await saveDocumentCopy(async () => pdf, pick, 'Receipt: kettle'), true);
    assert.equal(await saveDocumentCopy(async () => pdf, pick, 'Receipt: kettle'), true);
    for (const name of ['Receipt  kettle.pdf', 'Receipt  kettle (1).pdf']) {
      assert.deepEqual(new Uint8Array(readFileSync(join(dir, name))), pdf);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cancel is quiet and never reads or creates a file', async () => {
  let reads = 0;
  assert.equal(await saveDocumentCopy(async () => { reads++; return pdf; }, async () => { throw Object.assign(new Error('picker closed'), { code: 'ERR_PICKER_CANCELLED' }); }, 'Receipt'), false);
  assert.equal(reads, 0);
});

test('read failure never creates a destination', async () => {
  let creates = 0;
  await assert.rejects(saveDocumentCopy(async () => { throw new Error('missing'); }, async () => ({ list: () => [], createFile() { creates++; throw new Error('unexpected'); } }), 'Receipt'), /missing/);
  assert.equal(creates, 0);
});

test('write failure deletes only the new destination and reports the original error', async () => {
  const files = new Map([['Receipt.pdf', pdf]]);
  await assert.rejects(saveDocumentCopy(async () => pdf, async () => ({ list: () => [...files.keys()].map((name) => ({ name })), createFile(name: string) {
    assert.equal(name, 'Receipt (1).pdf');
    files.set(name, new Uint8Array());
    return { write() { throw new Error('storage full'); }, delete() { files.delete(name); } };
  } }), 'Receipt.pdf'), /storage full/);
  assert.deepEqual([...files.keys()], ['Receipt.pdf']);
  assert.deepEqual(files.get('Receipt.pdf'), pdf);
});

test('picker permission errors and create failures remain errors', async () => {
  await assert.rejects(saveDocumentCopy(async () => pdf, async () => { throw new Error('permission denied'); }, 'Receipt'), /permission denied/);
  await assert.rejects(saveDocumentCopy(async () => pdf, async () => ({ list: () => [], createFile() { throw new Error('read only'); } }), 'Receipt'), /read only/);
});
