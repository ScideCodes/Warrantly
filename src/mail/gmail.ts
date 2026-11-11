import { LANGUAGES } from '../parser/keywords.ts';
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

// One OR-group of every language's search words (section 7: "extend per language").
export const SEARCH_QUERY = `(${LANGUAGES.flatMap((l) => l.searchTerms).join(' OR ')})`;

// `getAccessToken` comes from expo-auth-session (gmail.readonly scope); refreshing it is the caller's job.
export function gmailProvider(getAccessToken: () => Promise<string>, fetchFn: typeof fetch = fetch): MailProvider {
  async function get(path: string): Promise<any> {
    const res = await fetchFn(`${API}/${path}`, { headers: { Authorization: `Bearer ${await getAccessToken()}` } });
    if (!res.ok) throw new Error(`Gmail ${res.status} on ${path.split('?')[0]}`);
    return res.json();
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
