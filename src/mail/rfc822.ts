// A mail shared into Warrantly as an .eml file (RFC 822 / MIME), read on the phone with no mail account.
// It becomes the same MailMessage the Gmail adapter makes, plus its PDF attachments, so nothing downstream
// knows where the mail came from. Plain TypeScript, tested in Node.
import type { MailMessage } from '../parser/types.ts';
import { parseAddress } from './gmail.ts';
import { htmlToText } from './htmlToText.ts';

export interface SharedMail { message: MailMessage; pdfs: { filename: string; bytes: Uint8Array }[] }

// Bytes as a one-char-per-byte string, so headers and boundaries can be matched without losing 8-bit bytes.
const binary = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
};
const toBytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function decodeText(bytes: Uint8Array, charset = 'utf-8'): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes); // unknown charset: UTF-8 is the best guess
  }
}

function split(raw: string): { headers: Map<string, string>; body: string } {
  const m = /\r?\n\r?\n/.exec(raw);
  const head = m ? raw.slice(0, m.index) : raw;
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) {
      const name = line.slice(0, i).trim().toLowerCase();
      if (!headers.has(name)) headers.set(name, line.slice(i + 1).trim());
    }
  }
  return { headers, body: m ? raw.slice(m.index + m[0].length) : '' };
}

// `name="x"` or `name=x` from a header value; RFC 2231 `name*=utf-8''x` too.
function param(value: string, name: string): string | null {
  const ext = value.match(new RegExp(`;\\s*${name}\\*=([^']*)'[^']*'([^;]+)`, 'i'));
  if (ext) return decodeText(toBytes(decodeURIComponent(ext[2].trim()).replace(/[^\0-\xff]/g, '')), ext[1] || 'utf-8');
  const m = value.match(new RegExp(`;\\s*${name}=(?:"([^"]*)"|([^;\\s]+))`, 'i'));
  return m ? (m[1] ?? m[2]) : null;
}

// "=?utf-8?Q?Rendel=C3=A9s?=" -> "Rendelés". Header values are binary strings; plain 8-bit headers are UTF-8.
export function decodeWords(value: string): string {
  const joined = value.replace(/(\?=)\s+(=\?)/g, '$1$2'); // whitespace between encoded words is dropped
  const parts = joined.split(/(=\?[^?]+\?[bqBQ]\?[^?]*\?=)/);
  return parts.map((p) => {
    const m = p.match(/^=\?([^?*]+)(?:\*[^?]*)?\?([bqBQ])\?([^?]*)\?=$/);
    if (!m) return decodeText(toBytes(p));
    const bytes = m[2].toUpperCase() === 'B'
      ? base64(m[3])
      : toBytes(m[3].replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
    return decodeText(bytes, m[1]);
  }).join('');
}

function base64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  return toBytes(atob(clean + '='.repeat((4 - (clean.length % 4)) % 4)));
}
const quotedPrintable = (s: string): Uint8Array =>
  toBytes(s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));

function bodyBytes(headers: Map<string, string>, body: string): Uint8Array {
  const enc = (headers.get('content-transfer-encoding') ?? '').toLowerCase();
  if (enc === 'base64') return base64(body);
  if (enc === 'quoted-printable') return quotedPrintable(body);
  return toBytes(body);
}

const MAX_DEPTH = 10; // nested multiparts in real mail are 3–4 deep; this stops a hostile file

export function parseRfc822(file: Uint8Array, fallbackId: string): SharedMail {
  const raw = binary(file);
  const top = split(raw);
  let plain = '';
  let html = '';
  const pdfs: SharedMail['pdfs'] = [];
  const attachments: MailMessage['attachments'] = [];

  (function walk(headers: Map<string, string>, body: string, depth: number) {
    const type = headers.get('content-type') ?? 'text/plain';
    const mime = type.split(';')[0].trim().toLowerCase();
    const boundary = param(type, 'boundary');
    if (mime.startsWith('multipart/') && boundary && depth < MAX_DEPTH) {
      const end = body.indexOf(`--${boundary}--`);
      const pieces = (end >= 0 ? body.slice(0, end) : body).split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*(?:\\r?\\n|$)`));
      for (const piece of pieces.slice(1)) {
        if (!piece.trim()) continue;
        const part = split(piece);
        walk(part.headers, part.body, depth + 1);
      }
      return;
    }
    if (mime === 'message/rfc822' && depth < MAX_DEPTH) {
      const inner = split(body); // a forwarded mail: read its body too
      walk(inner.headers, inner.body, depth + 1);
      return;
    }
    const disposition = headers.get('content-disposition') ?? '';
    const filename = decodeWords(param(disposition, 'filename') ?? param(type, 'name') ?? '');
    if (filename || /^attachment/i.test(disposition)) {
      attachments.push({ filename, mimeType: mime });
      if (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) pdfs.push({ filename: filename || 'document.pdf', bytes: bodyBytes(headers, body) });
      return;
    }
    const charset = param(type, 'charset') ?? 'utf-8';
    if (mime === 'text/plain' && !plain) plain = decodeText(bodyBytes(headers, body), charset);
    else if (mime === 'text/html' && !html) html = decodeText(bodyBytes(headers, body), charset);
  })(top.headers, top.body, 0);

  const header = (name: string) => decodeWords(top.headers.get(name) ?? '');
  const from = parseAddress(header('from'));
  const sent = new Date(header('date'));
  return {
    message: {
      id: header('message-id').replace(/[<>]/g, '') || fallbackId,
      from: from.address,
      fromName: from.name || undefined,
      to: header('to').split(',').map((a) => parseAddress(a).address).filter(Boolean),
      subject: header('subject'),
      date: (isNaN(sent.getTime()) ? new Date() : sent).toISOString(),
      text: html ? htmlToText(html) : plain, // same choice as the Gmail adapter
      attachments,
    },
    pdfs,
  };
}

// The text the form fills itself from (the same reader as a scanned receipt): the sender's name first, so it
// is taken as the store, then the date the mail was sent, the subject and the body.
export function mailToText(m: MailMessage): string {
  return [m.fromName || m.from, m.date.slice(0, 10), m.subject, m.text].filter(Boolean).join('\n');
}
