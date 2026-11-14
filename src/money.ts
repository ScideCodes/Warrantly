import { currencyData } from './currencyData.ts';

export const moneyLocale = (language: string) => language.startsWith('hu') ? 'hu-HU' : 'en-US';
export const fractionDigits = (currency: string) => currencyData[currency]?.digits ?? 2;
export const currencyName = (currency: string, language: string) => currencyData[currency]?.[language.startsWith('hu') ? 'hu' : 'en'] ?? currency;
export function currencyChoices(language: string, selected?: string) {
  const codes = Object.keys(currencyData);
  if (selected && !codes.includes(selected)) codes.push(selected); // Retain a historical currency on an existing receipt.
  return codes.map(code => ({ code, name: currencyName(code, language) })).sort((a, b) => a.name.localeCompare(b.name, moneyLocale(language)) || a.code.localeCompare(b.code));
}

// Canonical state uses a dot and no grouping. Reject letters, signs and excess precision rather than
// turning a pasted negative amount or a typo into a different purchase price.
export function priceInput(text: string, currency: string, language: string): string | null {
  const clean = text.normalize('NFKC').trim();
  if (!/^[0-9.,\s]*$/.test(clean)) return null;
  let value = clean.replace(/\s/g, '');
  if (!value) return '';
  const decimal = moneyLocale(language) === 'hu-HU' ? ',' : '.';
  if (value.includes('.') && value.includes(',')) {
    const last = value.lastIndexOf('.') > value.lastIndexOf(',') ? '.' : ',';
    const group = last === '.' ? ',' : '.';
    const [whole, fraction, extra] = value.split(last);
    const groups = whole.split(group);
    if (extra !== undefined || !/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some(g => !/^\d{3}$/.test(g))) return null;
    value = groups.join('') + '.' + fraction;
  } else if (decimal === '.' && /^\d{1,3}(,\d{3})+$/.test(value)) value = value.replace(/,/g, '');
  else value = value.replace(',', '.');
  if (!/^\d*(\.\d*)?$/.test(value)) return null;
  const [whole, fraction] = value.split('.');
  const integer = whole.replace(/^0+(?=\d)/, '') || '0';
  if (integer.length > 12 || (fraction?.length ?? 0) > fractionDigits(currency)) return null;
  return integer + (fraction !== undefined && fractionDigits(currency) > 0 ? '.' + fraction : '');
}
export function priceNumber(raw: string, currency: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(fractionDigits(currency))) : null;
}
export function priceDisplay(raw: string, currency: string, language: string): string {
  const value = priceNumber(raw, currency);
  return value === null ? '' : new Intl.NumberFormat(moneyLocale(language), { useGrouping: true, minimumFractionDigits: fractionDigits(currency), maximumFractionDigits: fractionDigits(currency) }).format(value);
}
export const editingPrice = (raw: string, language: string) => moneyLocale(language) === 'hu-HU' ? raw.replace('.', ',') : raw;
export function currencyFirst(language: string): boolean {
  const parts = new Intl.NumberFormat(moneyLocale(language), { style: 'currency', currency: 'USD', currencyDisplay: 'code' }).formatToParts(1);
  return parts.findIndex(p => p.type === 'currency') < parts.findIndex(p => p.type === 'integer');
}
