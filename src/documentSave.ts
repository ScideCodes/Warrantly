interface SavedFile {
  write(bytes: Uint8Array): void | Promise<void>;
  delete(): void;
}
interface Destination {
  list(): { name: string }[];
  createFile(name: string, mime: string): SavedFile;
}

// Kept separate from native imports so cancellation and partial writes can be exercised in Node.
export async function saveDocumentCopy(read: () => Promise<Uint8Array>, pick: () => Promise<Destination>, name: string): Promise<boolean> {
  let target: Destination;
  try {
    target = await pick();
  } catch (e) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? e.code : null;
    if (code === 'ERR_PICKER_CANCELLED' || /cancel/i.test(e instanceof Error ? e.message : String(e))) return false;
    throw e;
  }
  // Read before creating the destination, so a missing/unreadable source leaves no empty file.
  const bytes = await read();
  const base = name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').trim() || 'document';
  const filename = /\.pdf$/i.test(base) ? base : `${base}.pdf`;
  const used = new Set(target.list().map((file) => file.name.toLowerCase()));
  let available = filename;
  for (let n = 1; used.has(available.toLowerCase()); n++) available = filename.replace(/\.pdf$/i, ` (${n}).pdf`);
  const out = target.createFile(available, 'application/pdf');
  try {
    await out.write(bytes);
    return true;
  } catch (e) {
    // Only this call's new file is removed. Never find/delete a file by the requested display name.
    try { out.delete(); } catch { /* Preserve the write error if the provider also refuses cleanup. */ }
    throw e;
  }
}
