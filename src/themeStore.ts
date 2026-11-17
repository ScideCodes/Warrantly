// The palette store (pure: no React Native, tested in Node). One mutable `colors` object keeps its identity
// while the scheme changes; subscribers re-render and re-create their styles (src/theme.ts).

export interface Palette {
  bg: string; // page
  card: string; // grouped cards
  card2: string; // text fields inside cards
  ink: string;
  ink2: string; // secondary labels
  ink3: string; // tertiary
  chevron: string;
  line: string; // separators
  fill: string; // control tracks, neutral buttons
  fill2: string;
  press: string; // pressed row
  select: string; // tab lens, selected menu row
  tint: string; // glyphs
  tintInk: string; // tinted text
  link: string; // text buttons and links
  accent: string; // Glass Prominent button
  accentDown: string;
  onAccent: string;
  tintSoft: string; // selected rows
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  bad: string;
  badSoft: string;
  switchOff: string;
  switchOn: string;
  segOn: string;
  segShadow: string;
  material: string; // glass without a backdrop blur: the reference's own fallback (--material-solid)
  materialEdge: string;
  glassEdge: string; // outer: iOS 27's darkened separation edge and soft drop shadow
  glassRim: string; // inner: specular rim, bright on top and fainter below (painted above the lens)
  glassTint: string; // lens tint (LiquidGlassView glassTintColor) and its strength
  glassTintOpacity: number;
  glassSheen: number;
  tabbarEdge: string;
  sheetBg: string;
  sheetGroup: string;
  sheetField: string;
  grabber: string;
  dim: string;
  shadow: string;
}

export const light: Palette = {
  bg: '#f2f2f7',
  card: '#ffffff',
  card2: '#f2f2f7',
  ink: '#000000',
  ink2: '#6c6c70',
  ink3: '#c5c5c7',
  chevron: '#c5c5c7',
  line: '#e6e6e6',
  fill: 'rgba(120,120,128,0.12)',
  fill2: 'rgba(120,120,128,0.2)',
  press: '#d1d1d6',
  select: '#ededed',
  tint: '#0088ff',
  tintInk: '#0058b9',
  link: '#0066d6',
  accent: '#0071e3',
  accentDown: '#006edb',
  onAccent: '#ffffff',
  tintSoft: 'rgba(0,122,255,0.12)',
  ok: '#1b7a33',
  okSoft: '#e3f4e7',
  warn: '#c93400',
  warnSoft: '#fff1e6',
  bad: '#d70015',
  badSoft: '#ffe9eb',
  switchOff: '#8a8a8e',
  switchOn: '#248a3d',
  segOn: '#ffffff',
  segShadow: '0 2px 20px rgba(0,0,0,0.06)',
  material: '#f9f9f9',
  materialEdge: 'rgba(0,0,0,0.18)',
  glassEdge: '0 0 0 0.5px rgba(0,0,0,0.12), 0 2px 10px rgba(0,0,0,0.08)',
  glassRim: 'inset 0 1px 0.5px rgba(255,255,255,0.95), inset 0 -1px 0.5px rgba(255,255,255,0.55), inset 0 0 8px rgba(255,255,255,0.2)',
  glassTint: '#ffffff',
  glassTintOpacity: 0.18,
  glassSheen: 0.55,
  tabbarEdge: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -0.5px 0 rgba(255,255,255,0.4), inset 0 0 0 0.5px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.06)',
  sheetBg: '#f2f2f7',
  sheetGroup: '#ffffff',
  sheetField: '#f2f2f7',
  grabber: '#cccccc',
  dim: 'rgba(0,0,0,0.35)',
  shadow: '0 10px 40px rgba(0,0,0,0.14)',
};

export const dark: Palette = {
  bg: '#000000',
  card: '#1c1c1e',
  card2: '#2c2c2e',
  ink: '#ffffff',
  ink2: '#98989f',
  ink3: '#636366',
  chevron: '#636366',
  line: 'rgba(84,84,88,0.65)',
  fill: 'rgba(120,120,128,0.24)',
  fill2: 'rgba(120,120,128,0.36)',
  press: 'rgba(255,255,255,0.08)',
  select: 'rgba(255,255,255,0.14)',
  tint: '#0a84ff',
  tintInk: '#52a5ff',
  link: '#5ea6ff',
  accent: '#0a84ff',
  accentDown: '#0071e3',
  onAccent: '#ffffff',
  tintSoft: 'rgba(10,132,255,0.18)',
  ok: '#30d158',
  okSoft: '#12321c',
  warn: '#ff9f0a',
  warnSoft: '#3a2a10',
  bad: '#ff453a',
  badSoft: '#3d1a1a',
  switchOff: 'rgba(235,235,245,0.3)',
  switchOn: '#30d158',
  segOn: '#636366',
  segShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.18), 0 1px 3px rgba(0,0,0,0.24)',
  material: '#242426',
  materialEdge: 'rgba(255,255,255,0.22)',
  glassEdge: '0 0 0 0.5px rgba(0,0,0,0.6), 0 2px 10px rgba(0,0,0,0.4)',
  glassRim: 'inset 0 1px 0.5px rgba(255,255,255,0.34), inset 0 -1px 0.5px rgba(255,255,255,0.14), inset 0 0 8px rgba(255,255,255,0.06)',
  glassTint: '#1c1c1e',
  glassTintOpacity: 0.32,
  glassSheen: 0.08,
  tabbarEdge: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 0.5px rgba(255,255,255,0.14), 0 4px 20px rgba(0,0,0,0.50)',
  sheetBg: '#1c1c1e',
  sheetGroup: '#2c2c2e',
  sheetField: '#3a3a3c',
  grabber: '#636366',
  dim: 'rgba(0,0,0,0.45)',
  shadow: '0 8px 28px rgba(0,0,0,0.35)',
};

export type ThemeSetting = 'system' | 'light' | 'dark';

// Auto follows the phone; Light and Dark override it.
export const resolveDark = (setting: string, system: string | null | undefined): boolean => (setting === 'system' ? system === 'dark' : setting === 'dark');

type Tone = { fg: string; bg: string };
export interface ThemeState {
  dark: boolean;
  version: number; // bumps on every scheme change: the key for re-created styles
}

export function createThemeStore(initialDark: boolean) {
  const colors: Palette = { ...(initialDark ? dark : light) };
  // Days-left badge (not in the reference): its soft/strong colour pairs, quiet when nothing is urgent.
  const tone: Record<'ok' | 'warning' | 'soon' | 'expired', Tone> = { ok: { fg: '', bg: '' }, warning: { fg: '', bg: '' }, soon: { fg: '', bg: '' }, expired: { fg: '', bg: '' } };
  const fillTone = () => {
    Object.assign(tone.ok, { fg: colors.ink2, bg: colors.fill });
    Object.assign(tone.warning, { fg: colors.warn, bg: colors.warnSoft });
    Object.assign(tone.soon, { fg: colors.bad, bg: colors.badSoft });
    Object.assign(tone.expired, { fg: colors.ink2, bg: colors.fill });
  };
  fillTone();
  let state: ThemeState = { dark: initialDark, version: 0 };
  const listeners = new Set<() => void>();
  return {
    colors,
    tone,
    get: (): ThemeState => state,
    // Switches the scheme in place. Returns false (and notifies nobody) when it is already showing.
    set(nextDark: boolean): boolean {
      if (nextDark === state.dark) return false;
      Object.assign(colors, nextDark ? dark : light);
      fillTone();
      state = { dark: nextDark, version: state.version + 1 };
      listeners.forEach((l) => l());
      return true;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
