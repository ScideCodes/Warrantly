import { parseEmail } from '../parser/parse.ts';
import type { MailMessage, ParseResult, StoreRules } from '../parser/types.ts';

// One mail account (brainstorm section 15). Gmail first; Outlook and IMAP implement the same three calls.
export interface MailProvider {
  // Ids of candidate purchase/warranty mails newer than `after` (null = the whole mailbox).
  listMessageIds(after: Date | null): Promise<string[]>;
  getMessage(id: string): Promise<MailMessage>;
  getAttachment(messageId: string, attachmentId: string): Promise<Uint8Array>;
}

export interface SyncResult {
  results: ParseResult[];
  failed: { id: string; error: string }[]; // mails that could not be fetched; the rest of the sync still counts
}

// One sync pass: fetch every new candidate and parse it. Sequential on purpose, to stay
// well under the Gmail per-user rate limit. One unreadable mail never stops the whole sync.
export async function fetchAndParse(
  provider: MailProvider,
  after: Date | null,
  storeRules: StoreRules = {},
  onProgress?: (done: number, total: number) => void,
): Promise<SyncResult> {
  const sync: SyncResult = { results: [], failed: [] };
  const ids = await provider.listMessageIds(after);
  for (const [i, id] of ids.entries()) {
    onProgress?.(i, ids.length);
    try {
      sync.results.push(parseEmail(await provider.getMessage(id), storeRules));
    } catch (e) {
      sync.failed.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return sync;
}
