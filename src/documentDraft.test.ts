import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DocumentDraft, type CapturedDocument } from './documentDraft.ts';

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('save and second import cannot overtake an unfinished scan', async () => {
  const removed: string[] = [];
  const draft = new DocumentDraft((paths) => removed.push(...paths));
  const scan = pending<CapturedDocument | null>();
  const capturing = draft.capture(() => scan.promise);
  let writes = 0;
  assert.equal(await draft.save(async () => { writes++; }), false);
  assert.equal(await draft.capture(async () => { throw new Error('second picker opened'); }), null);
  scan.resolve({ text: '', localPath: 'receipt.pdf' });
  await capturing;
  assert.equal(await draft.save(async (path) => { assert.equal(path, 'receipt.pdf'); writes++; }), true);
  draft.dispose();
  assert.equal(writes, 1);
  assert.deepEqual(removed, []);
});

test('closing a form before import returns removes the late temporary PDF', async () => {
  const removed: string[] = [];
  const draft = new DocumentDraft((paths) => removed.push(...paths));
  const scan = pending<CapturedDocument | null>();
  const capturing = draft.capture(() => scan.promise);
  draft.dispose();
  scan.resolve({ text: '', localPath: 'late.pdf' });
  assert.equal(await capturing, null);
  assert.deepEqual(removed, ['late.pdf']);
  assert.equal(draft.path, null);
});

test('cancel or failure keeps the first attachment; retry saves that same file', async () => {
  const removed: string[] = [];
  const draft = new DocumentDraft((paths) => removed.push(...paths));
  await draft.capture(async () => ({ text: '', localPath: 'first.pdf' }));
  await draft.capture(async () => null);
  await assert.rejects(draft.capture(async () => { throw new Error('picker'); }));
  await assert.rejects(draft.save(async () => { throw new Error('disk full'); }));
  assert.equal(draft.path, 'first.pdf');
  assert.equal(draft.busy, null);
  await draft.save(async (path) => { assert.equal(path, 'first.pdf'); });
  draft.dispose();
  assert.deepEqual(removed, []);
});

for (const succeeds of [true, false]) {
  test(`leaving during save cleans the file only if persistence fails (${succeeds})`, async () => {
    const removed: string[] = [];
    const draft = new DocumentDraft((paths) => removed.push(...paths));
    await draft.capture(async () => ({ text: '', localPath: 'receipt.pdf' }));
    const write = pending<void>();
    const saving = draft.save(() => write.promise);
    assert.equal(await draft.save(async () => { throw new Error('duplicate'); }), false);
    draft.dispose();
    assert.deepEqual(removed, []);
    if (succeeds) { write.resolve(); assert.equal(await saving, true); }
    else { write.reject(new Error('disk full')); await assert.rejects(saving); }
    assert.deepEqual(removed, succeeds ? [] : ['receipt.pdf']);
  });
}

test('replacing and abandoning a draft deletes only temporary documents', async () => {
  const removed: string[] = [];
  const draft = new DocumentDraft((paths) => removed.push(...paths));
  await draft.capture(async () => ({ text: '', localPath: 'old.pdf' }));
  await draft.capture(async () => ({ text: '', localPath: 'new.pdf' }));
  draft.dispose();
  draft.dispose();
  assert.deepEqual(removed, ['old.pdf', 'new.pdf']);
});
