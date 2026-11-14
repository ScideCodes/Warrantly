export const ACCENTS = { blue: '#0071E3', teal: '#008579', green: '#288343', purple: '#8652CE', orange: '#C75B14' } as const;
export function validAccent(value: string): boolean { return Object.hasOwn(ACCENTS, value) || /^#[0-9a-f]{6}$/i.test(value); }
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export const mix = (a: string, b: string, amount: number) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * amount).toString(16).padStart(2, '0')).join('');
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => rgb(hex).map(v => { const n = v / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function accentColors(value: string, dark: boolean) {
  const base: string = ACCENTS[value as keyof typeof ACCENTS] ?? (validAccent(value) ? value : ACCENTS.blue);
  const tintSoft = mix(base, dark ? '#1c1c1e' : '#ffffff', dark ? .78 : .9);
  const legible = (background: string, toward: string, other = background) => {
    let color = base;
    for (let i = 1; (contrast(color, background) < 4.5 || contrast(color, other) < 4.5) && i <= 100; i++) color = mix(base, toward, i / 100);
    return color;
  };
  const accent = legible('#ffffff', '#000000');
  const tintInk = legible(dark ? '#2c2c2e' : '#f2f2f7', dark ? '#ffffff' : '#000000', tintSoft);
  return { accent, accentDown: mix(accent, '#000000', .12), onAccent: '#ffffff', tint: tintInk, tintInk, link: tintInk,
    tintSoft, switchOn: accent };
}
