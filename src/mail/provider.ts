import { parseEmail } from '../parser/parse.ts';
import type { MailMessage, ParseResult, StoreRules } from '../parser/types.ts';

// One mail account (brainstorm section 15). Gmail first; Outlook and IMAP implement the same three calls.
export interface MailProvider {
  // Ids of candidate purchase/warranty mails newer than `after` (null = the whole mailbox).
  listMessageIds(after: Date | null): Promise<string[]>;
  getMessage(id: string): Promise<MailMessage>;
  getAttachment(messageId: string, attachmentId: string): Promise<Uint8Array>;
}

// One sync pass: fetch every new candidate and parse it. Sequential on purpose, to stay
// well under the Gmail per-user rate limit without any retry logic.
export async function fetchAndParse(provider: MailProvider, after: Date | null, storeRules: StoreRules = {}): Promise<ParseResult[]> {
  const results: ParseResult[] = [];
  for (const id of await provider.listMessageIds(after)) {
    results.push(parseEmail(await provider.getMessage(id), storeRules));
  }
  return results;
}
