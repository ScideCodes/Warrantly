// Serial number reading (shortlist 11): candidates from a barcode or from text read off a label. The user
// always confirms or edits the value before it is saved. Pure, tested in Node.

const LABEL = /\b(?:s\/?n|sn\b|serial(?:\s*(?:no|number|nr|id|#))?|ser\.?\s*no|sorozatsz[aá]m|gy[aá]ri\s*(?:sz[aá]m|sz\.)|gy\.?\s*sz\.?|gsz\.?|imei)\b\.?\s*[:#=\s-]?\s*([A-Z0-9][A-Z0-9-]{3,29})/i;
const TOKEN = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9][A-Z0-9-]{5,29}\b/g;

// A labelled value ("S/N: ABC123") first, then code-like words with both letters and digits; longest first.
export function serialCandidates(lines: string[]): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const v = s.replace(/-+$/, '');
    if (v.length >= 4 && !out.includes(v)) out.push(v);
  };
  for (const line of lines) {
    const m = line.match(LABEL);
    if (m) add(m[1].toUpperCase());
  }
  const rest: string[] = [];
  for (const line of lines) for (const m of line.toUpperCase().matchAll(TOKEN)) if (!out.includes(m[0])) rest.push(m[0]);
  [...new Set(rest)].sort((a, b) => b.length - a.length).slice(0, 5).forEach(add);
  return out.slice(0, 6);
}

// A barcode's content as a serial: trimmed; a URL or very long payload is not one.
export function serialFromBarcode(data: string): string | null {
  const v = data.trim();
  if (!v || v.length > 40 || /^[a-z]+:\/\//i.test(v) || /\s{2,}/.test(v)) return null;
  return v;
}

// Hand-over between the scanner screen and the form that opened it.
let pending: string | null = null;
export const putScannedSerial = (v: string): void => void (pending = v);
export function takeScannedSerial(): string | null {
  const v = pending;
  pending = null;
  return v;
}
