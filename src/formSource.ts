// The warranty an edit or copy form starts from. Kept free of native imports so it can be tested in Node.
export type SourceStatus = 'loading' | 'ready' | 'missing' | 'failed';
export interface SourceState {
  key: string | null; // null: a new warranty, nothing to load
  status: SourceStatus;
  error?: string;
}

export const sourceKey = (id?: string, copyFrom?: string): string | null => (id ? `edit:${id}` : copyFrom ? `copy:${copyFrom}` : null);

// Only the latest load may report. An older, slower one (the route changed, Retry was pressed, the screen
// closed) is dropped, so it can never overwrite newer data or fill a form the person is already editing.
export class SourceLoader<T> {
  private request = 0;
  private report: (state: SourceState, value: T | null) => void;
  constructor(report: (state: SourceState, value: T | null) => void) {
    this.report = report;
  }

  async load(key: string | null, fetch: () => Promise<T | null>): Promise<void> {
    const request = ++this.request;
    if (key === null) return this.report({ key, status: 'ready' }, null);
    this.report({ key, status: 'loading' }, null);
    try {
      const value = await fetch();
      if (request === this.request) this.report({ key, status: value ? 'ready' : 'missing' }, value);
    } catch (e) {
      if (request === this.request) this.report({ key, status: 'failed', error: e instanceof Error ? e.message : String(e) }, null);
    }
  }

  cancel(): void {
    this.request++;
  }
}
