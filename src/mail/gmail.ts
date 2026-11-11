import { IGNORED_SENDERS, LANGUAGES } from '../parser/keywords.ts';
import type { MailMessage } from '../parser/types.ts';
import { htmlToText } from './htmlToText.ts';
import type { MailProvider } from './provider.ts';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Gmail REST message resource, format=full (only the fields we read).
export interface GmailPart {
  mimeType: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}
export interface GmailApiMessage {
  id: string;
  internalDate: string; // ms since epoch, as a string
  payload: GmailPart;
}

// Invoices and warranty documents (by subject or PDF name) plus cancellations, minus senders that
// never sell warranty goods. Narrow on purpose: every fetched mail costs Gmail quota and time.
const or = (terms: string[]) => terms.join(' OR ');
export const SEARCH_QUERY =
  `(subject:(${or(LANGUAGES.flatMap((l) => l.documentTerms))}) ` +
  `OR filename:(${or(['szamla', 'invoice', 'receipt', 'nyugta', 'garancia', 'warranty'])}) ` +
  `OR ${or(LANGUAGES.flatMap((l) => l.returnTerms))}) ` +
  `-from:(${or([...IGNORED_SENDERS])}) -in:sent`; // forwarded invoices would double up

// `getAccessToken` may cache; it gets the rejected token back after a 401 and must return a fresh one.
export function gmailProvider(getAccessToken: (expired?: string) => Promise<string>, fetchFn: typeof fetch = fetch, retryDelayMs = 1000): MailProvider {
  async function get(path: string, attempt = 1, expired?: string): Promise<any> {
    const token = await getAccessToken(expired);
    const res = await fetchFn(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return res.json();
    if (res.status === 401 && !expired) return get(path, attempt, token); // cached token expired: refresh once
    // Google's reason (e.g. accessNotConfigured, rateLimitExceeded) says what to fix.
    const text = await res.text().catch(() => '');
    let code = '';
    let reason = '';
    try {
      const err = JSON.parse(text).error;
      code = err?.errors?.[0]?.reason ?? err?.status ?? '';
      reason = [code, err?.message].filter(Boolean).join(' - ');
    } catch {
      reason = text.slice(0, 120);
    }
    // The per-user quota is counted per minute, so a rate limit needs a long pause; 5xx only a short one.
    const rateLimited = res.status === 429 || /rateLimitExceeded|RESOURCE_EXHAUSTED/i.test(code);
    if (attempt < 4 && (rateLimited || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, retryDelayMs * (rateLimited ? 20 : 1) * attempt));
      return get(path, attempt + 1);
    }
    throw new Error(`Gmail ${res.status} on ${path.split('?')[0]}${reason && `: ${reason}`}`);
  }

  return {
    async listMessageIds(after) {
      const q = after ? `${SEARCH_QUERY} after:${Math.floor(after.getTime() / 1000)}` : SEARCH_QUERY;
      const ids: string[] = [];
      let pageToken = '';
      do {
        const page = await get(`messages?maxResults=100&q=${encodeURIComponent(q)}${pageToken && `&pageToken=${pageToken}`}`);
        ids.push(...(page.messages ?? []).map((m: { id: string }) => m.id));
        pageToken = page.nextPageToken ?? '';
      } while (pageToken);
      return ids;
    },
    async getMessage(id) {
      return toMailMessage(await get(`messages/${id}?format=full`));
    },
    async getAttachment(messageId, attachmentId) {
      const { data } = await get(`messages/${messageId}/attachments/${attachmentId}`);
      return base64UrlToBytes(data);
    },
  };
}

export function toMailMessage(m: GmailApiMessage): MailMessage {
  const header = (name: string) => m.payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
  const from = parseAddress(header('from'));
  let plain = '';
  let html = '';
  const attachments: MailMessage['attachments'] = [];

  (function walk(part: GmailPart) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({ filename: part.filename, mimeType: part.mimeType, id: part.body.attachmentId });
    } else if (part.body?.data && part.mimeType === 'text/plain' && !plain) {
      plain = decodeBody(part);
    } else if (part.body?.data && part.mimeType === 'text/html' && !html) {
      html = decodeBody(part);
    }
    part.parts?.forEach(walk);
  })(m.payload);

  return {
    id: m.id,
    from: from.address,
    fromName: from.name || undefined,
    to: header('to').split(',').map((a) => parseAddress(a).address).filter(Boolean),
    subject: header('subject'),
    date: new Date(Number(m.internalDate)).toISOString(),
    // HTML keeps the table layout the item finder needs; shops' text/plain parts often flatten it.
    text: html ? htmlToText(html) : plain,
    attachments,
  };
}

// '"Alza.hu" <segito@alza.hu>' -> { name: 'Alza.hu', address: 'segito@alza.hu' }
export function parseAddress(raw: string): { name: string; address: string } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), address: m[2].trim().toLowerCase() };
  return { name: '', address: raw.trim().toLowerCase() };
}

function decodeBody(part: GmailPart): string {
  const contentType = part.headers?.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '';
  const charset = contentType.match(/charset="?([\w-]+)/i)?.[1] ?? 'utf-8';
  const bytes = base64UrlToBytes(part.body!.data!);
  // shortcut: relies on atob and TextDecoder, both present in Node and recent Hermes (Expo SDK 52+).
  // Verify non-UTF-8 charsets (e.g. iso-8859-2) on a real Android build; fall back to UTF-8 if unsupported.
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function base64UrlToBytes(data: string): Uint8Array {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
