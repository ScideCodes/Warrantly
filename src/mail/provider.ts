import { parseEmail } from '../parser/parse.ts';
import type { MailMessage, ParseResult, StoreRules } from '../parser/types.ts';

// One mail account (brainstorm section 15). Gmail first; Outlook and IMAP implement the same three calls.
export interface MailProvider {
  // Ids of candidate purchase/warranty mails newer than `after` (null = the whole mailbox), newest first.
  listMessageIds(after: Date | null): Promise<string[]>;
  getMessage(id: string): Promise<MailMessage>;
  getAttachment(messageId: string, attachmentId: string): Promise<Uint8Array>;
}

export interface SyncResult {
  results: ParseResult[];
  failed: { id: string; error: string }[]; // mails that could not be fetched; the rest of the sync still counts
}

export interface FetchOptions {
  storeRules?: StoreRules;
  skip?: Set<string>; // message ids already processed in an earlier sync
  onProgress?: (done: number, total: number) => void;
  onResult?: (result: ParseResult, message: MailMessage) => Promise<void>; // save as we go, so an interrupted sync keeps its work
}

// One sync pass: fetch every new candidate and parse it. Sequential on purpose, to stay
// well under the Gmail per-user rate limit. One unreadable mail never stops the whole sync.
export async function fetchAndParse(provider: MailProvider, after: Date | null, opts: FetchOptions = {}): Promise<SyncResult> {
  const sync: SyncResult = { results: [], failed: [] };
  // Providers list newest first. Read oldest first, so an order is saved before the invoice PDF or the
  // refund that follows it and those find their warranty.
  const ids = (await provider.listMessageIds(after)).filter((id) => !opts.skip?.has(id)).reverse();
  for (const [i, id] of ids.entries()) {
    opts.onProgress?.(i, ids.length);
    let result: ParseResult;
    let message: MailMessage;
    try {
      message = await provider.getMessage(id);
      result = parseEmail(message, opts.storeRules);
    } catch (e) {
      sync.failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    await opts.onResult?.(result, message); // a save error is a bug, not a bad mail: let it stop the sync
    sync.results.push(result);
  }
  return sync;
}
