export type CapturedDocument = { text: string; localPath: string };

// Owns a form's temporary PDF until the database accepts it. A picker can finish after the form closes.
export class DocumentDraft {
  path: string | null = null;
  busy: 'scan' | 'save' | null = null;
  private closed = false;
  private remove: (paths: string[]) => void;

  constructor(remove: (paths: string[]) => void) { this.remove = remove; }

  async capture(source: () => Promise<CapturedDocument | null>): Promise<CapturedDocument | null> {
    if (this.closed || this.busy) return null;
    this.busy = 'scan';
    try {
      const result = await source();
      if (!result) return null;
      if (this.closed) {
        this.remove([result.localPath]);
        return null;
      }
      if (this.path && this.path !== result.localPath) this.remove([this.path]);
      this.path = result.localPath;
      return result;
    } finally {
      this.busy = null;
    }
  }

  async save(persist: (path: string | null) => Promise<void>): Promise<boolean> {
    if (this.closed || this.busy) return false;
    this.busy = 'save';
    try {
      await persist(this.path);
      this.path = null; // the database now owns the file
      return true;
    } finally {
      this.busy = null;
      if (this.closed) this.discard();
    }
  }

  dispose(): void {
    this.closed = true;
    // An in-flight transaction may still commit this file; defer cleanup until its outcome is known.
    if (this.busy !== 'save') this.discard();
  }

  private discard(): void {
    if (this.path) this.remove([this.path]);
    this.path = null;
  }
}
