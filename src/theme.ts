import { Appearance, type TextStyle } from 'react-native';
import { getThemeSetting } from '@/settings';

// The bencepc.hu "iOS 27" design system (public/assets/ios.css at 551a366). Every value here is copied from
// that file; docs/visual-reference.md lists the source line of each and what the reference does not define.
// Screens read colours, type and geometry only from here.
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
  glassEdge: string;
  glassSheen: number;
  tabbarEdge: string;
  sheetBg: string;
  sheetGroup: string;
  sheetField: string;
  grabber: string;
  dim: string;
  shadow: string;
}

const light: Palette = {
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
  glassEdge: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -0.5px 0 rgba(255,255,255,0.4), inset 0 0 0 0.5px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.06)',
  glassSheen: 0.55,
  tabbarEdge: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -0.5px 0 rgba(255,255,255,0.4), inset 0 0 0 0.5px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.06)',
  sheetBg: '#f2f2f7',
  sheetGroup: '#ffffff',
  sheetField: '#f2f2f7',
  grabber: '#cccccc',
  dim: 'rgba(0,0,0,0.35)',
  shadow: '0 10px 40px rgba(0,0,0,0.14)',
};

const dark: Palette = {
  bg: '#000000',
  card: '#1c1c1e',
  card2: '#2c2c2e',
  ink: '#ffffff',
  ink2: '#a1a1aa',
  ink3: '#73737b',
  chevron: '#5a5a5e',
  line: 'rgba(84,84,88,0.65)',
  fill: 'rgba(120,120,128,0.24)',
  fill2: 'rgba(120,120,128,0.36)',
  press: '#3a3a3c',
  select: 'rgba(255,255,255,0.12)',
  tint: '#0091ff',
  tintInk: '#409cff',
  link: '#64a8ff',
  accent: '#0070e0',
  accentDown: '#0062c7',
  onAccent: '#ffffff',
  tintSoft: 'rgba(10,132,255,0.2)',
  ok: '#30d158',
  okSoft: '#12321c',
  warn: '#ff9f0a',
  warnSoft: '#3a2a10',
  bad: '#ff453a',
  badSoft: '#3d1a1a',
  switchOff: 'rgba(235,235,245,0.3)',
  switchOn: '#248a3d',
  segOn: '#636366',
  segShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.16), 0 1px 3px rgba(0,0,0,0.16)',
  material: '#1c1c1e',
  materialEdge: 'rgba(255,255,255,0.15)',
  glassEdge: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 0.5px rgba(255,255,255,0.11), 0 2px 6px rgba(0,0,0,0.12)',
  glassSheen: 0.18,
  tabbarEdge: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 0 0 0.5px rgba(255,255,255,0.08)',
  sheetBg: '#1c1c1e',
  sheetGroup: '#2c2c2e',
  sheetField: '#3a3a3c',
  grabber: '#636366',
  dim: 'rgba(0,0,0,0.42)',
  shadow: '0 8px 28px rgba(0,0,0,0.28)',
};

// Chosen once at start: styles are created when screens load, so a change applies after a restart
// (Settings restarts the app when you pick a theme).
export const isDark = (getThemeSetting() === 'system' ? Appearance.getColorScheme() : getThemeSetting()) === 'dark';
export const colors: Palette = isDark ? dark : light;

// The reference's sheen on glass: a soft light from the top left (`::after`, ios.css line 145).
export const SHEEN = 'radial-gradient(120% 90% at 25% 0%, rgba(255,255,255,0.5), transparent 55%)';

// Type ramp (ios.css lines 34-43). Letter spacing is the reference's em value times the size.
const t = (fontSize: number, lineHeight: number, fontWeight: TextStyle['fontWeight'], em = 0): TextStyle => ({
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing: Math.round(em * fontSize * 100) / 100,
});
export const TYPE = {
  large: t(34, 41, '700', 0.011),
  title2: t(22, 28, '700', 0.015),
  title3: t(20, 25, '600'),
  section: t(20, 25, '600', -0.022),
  headline: t(17, 22, '600', -0.0255),
  body: t(17, 22, '400', -0.0255),
  button: t(17, 22, '500', -0.0255),
  bar: t(15, 20, '600', -0.015),
  sub: t(15, 20, '400', -0.015),
  foot: t(13, 18, '400', -0.005),
  cap: t(12, 16, '400'),
  seg: t(13.33, 18, '500'),
  tab: t(10, 12, '600'),
} as const;

// Geometry (dp). The page margin is 16 below 375 wide and 20 from 375 (`--gutter`).
export const gutter = (width: number) => (width < 375 ? 16 : 20);
export const RADIUS = 26; // grouped card
export const ROW_H = 52; // one-line row
export const ROW_TALL = 68; // label above value
export const ROW_X = 16; // row inset
export const SEP_ICON = 59; // separator start after a 29dp icon tile
export const BAR_H = 60; // navigation bar
export const CONTROL_H = 44; // buttons, text fields, glass buttons
export const FIELD_RADIUS = 14;
export const MAX_WIDTH = 720; // Warrantly's content cap on tablets (not in the reference)

// Motion (ios.css lines 45-48, 85; chrome.js). Springs: the reference's response/damping as stiffness/damping.
export const SPRING = { stiffness: 223.8, damping: 23.34, mass: 1 }; // response .42 s, damping ratio .78
export const SPRING_BOUNCE = { stiffness: 223.8, damping: 18.55, mass: 1 }; // damping ratio .62
export const SHEET_SPRING = { stiffness: 520, damping: 46, mass: 1 }; // chrome.js makeSheet
export const EASE = [0.23, 1, 0.32, 1] as const;

// Days-left badge (not in the reference): its soft/strong colour pairs, quiet when nothing is urgent.
export const TONE = {
  ok: { fg: colors.ink2, bg: colors.fill },
  warning: { fg: colors.warn, bg: colors.warnSoft },
  soon: { fg: colors.bad, bg: colors.badSoft },
  expired: { fg: colors.ink2, bg: colors.fill },
} as const;
