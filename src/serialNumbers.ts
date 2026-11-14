export interface SerialEntry { label: string; value: string }
export interface SerialSource { serial_number?: unknown; serial_numbers?: unknown }
export const MAX_SERIALS = 20;

export function validSerialEntries(entries: SerialEntry[]): boolean {
  return entries.length <= MAX_SERIALS && entries.every(e => e.label.length <= 60 && e.value.length <= 120 && (!e.label.trim() || !!e.value.trim()));
}
export function encodeSerialEntries(entries: SerialEntry[]): string | null {
  if (!validSerialEntries(entries)) throw new Error('Invalid serial numbers');
  const clean = entries.filter(e => e.value.trim()).map(e => ({ label: e.label.trim(), value: e.value.trim() }));
  return clean.length ? JSON.stringify(clean) : null;
}

// Old records/backups/share files have one scalar. New ones keep labeled values and mirror
// the first value in that scalar for older consumers. Never interpret the scalar itself as JSON.
export function serialEntries(source: SerialSource): SerialEntry[] {
  if (typeof source.serial_numbers === 'string' && source.serial_numbers.length <= 32_768) {
    try {
      const entries: unknown = JSON.parse(source.serial_numbers);
      if (Array.isArray(entries) && entries.length <= MAX_SERIALS && entries.every(e => e && typeof e.label === 'string' && typeof e.value === 'string')) {
        const list = entries as SerialEntry[];
        if (validSerialEntries(list)) return list.filter(e => e.value.trim()).map(e => ({ label: e.label.trim(), value: e.value.trim() }));
      }
    } catch { /* Older or malformed incoming data still retains its scalar serial. */ }
  }
  return typeof source.serial_number === 'string' && source.serial_number.trim() ? [{ label: '', value: source.serial_number.trim() }] : [];
}

export function serialSummary(source: SerialSource): string | null {
  return serialEntries(source).map(e => e.label ? `${e.label}: ${e.value}` : e.value).join('\n') || null;
}

export function serialFields(input: SerialSource, previous?: SerialSource): { serial_number: string | null; serial_numbers: string | null } {
  let entries = serialEntries(input);
  if (input.serial_numbers === undefined && previous) {
    // A scalar-only caller updating another field must not erase additional components.
    entries = serialEntries(previous);
    const value = typeof input.serial_number === 'string' ? input.serial_number.trim() : '';
    if (value) entries = [{ label: entries[0]?.label ?? '', value }, ...entries.slice(1)];
    else entries = entries.slice(1);
  }
  return { serial_number: entries[0]?.value ?? null, serial_numbers: encodeSerialEntries(entries) };
}

export function mergeSerialEntries(a: SerialSource, b: SerialSource): SerialEntry[] {
  const result = serialEntries(a);
  for (const entry of serialEntries(b)) {
    const match = result.find(e => e.value.toUpperCase() === entry.value.toUpperCase() && (!e.label || !entry.label || e.label.toLocaleLowerCase() === entry.label.toLocaleLowerCase()));
    if (!match) result.push(entry);
    else if (!match.label) match.label = entry.label;
  }
  if (!validSerialEntries(result)) throw new Error('Too many serial numbers to merge');
  return result;
}
