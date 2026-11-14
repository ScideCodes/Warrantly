// Links built from stored data. Store contacts come from shop mails and from Warrantly files other people
// send, so they are untrusted: only web pages, mail and phone calls are opened, never other schemes
// (intent:, file:, javascript:, app links).

export function webUrl(value: string): string | null {
  const v = value.trim();
  if (!v || /\s/.test(v)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') ? u.href : null;
  } catch {
    return null;
  }
}

export function mailUrl(value: string): string | null {
  const v = value.trim();
  return /^[^\s@?&#/:]+@[^\s@?&#/:]+\.[^\s@?&#/:]+$/.test(v) ? `mailto:${v}` : null;
}

export function telUrl(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '');
  return /^\+?\d{3,20}$/.test(digits) ? `tel:${digits}` : null;
}

// A MIME type as declared by another app, safe to place in a data: URL.
export const imageMime = (mime: string | null): string => (mime && /^image\/[a-z0-9.+-]{1,40}$/i.test(mime) ? mime : 'image/jpeg');
