import { useSyncExternalStore } from 'react';
import { Appearance, AppState, useWindowDimensions, type TextStyle } from 'react-native';
import { getThemeSetting } from '@/settings';
import { createThemeStore, resolveDark, type ThemeState } from '@/themeStore';

// The bencepc.hu "iOS 27" design system (public/assets/ios.css at 551a366). Every colour comes from that file
// (palettes in src/themeStore.ts); docs/visual-reference.md lists the source line of each and what the reference
// does not define. Screens read colours, type and geometry only from here.
export type { Palette, ThemeSetting } from '@/themeStore';

// Live theme: Light, Dark or Auto (the phone's setting) apply at once, without a restart. `colors` is one
// object updated in place; components that read it subscribe with useTheme() or a themed() style hook.
const store = createThemeStore(resolveDark(getThemeSetting(), Appearance.getColorScheme()));
export const colors = store.colors;
export const TONE = store.tone;

// Re-reads the setting and the phone's scheme. Called after Settings changes the setting, when the phone
// switches (Auto), and when the app comes back from the background (a change made meanwhile).
export const applyTheme = (): boolean => store.set(resolveDark(getThemeSetting(), Appearance.getColorScheme()));
Appearance.addChangeListener(() => applyTheme());
AppState.addEventListener('change', (state) => state === 'active' && applyTheme());

export const isDarkNow = (): boolean => store.get().dark;
export const useTheme = (): ThemeState => useSyncExternalStore(store.subscribe, store.get);

// A style sheet that follows the theme: `const useStyles = themed(() => StyleSheet.create({...}))`, then
// `const styles = useStyles()` in the component. Built once per scheme change, shared by every caller.
export function themed<T>(make: () => T): () => T {
  let cache: { version: number; value: T } | null = null;
  return () => {
    const { version } = useTheme();
    if (!cache || cache.version !== version) cache = { version, value: make() };
    return cache.value;
  };
}

// The reference's sheen on glass: a soft light from the top left (`::after`, ios.css line 145).
export const SHEEN = 'radial-gradient(120% 90% at 25% 0%, rgba(255,255,255,0.5), transparent 55%)';

// Type ramp: the reference's hierarchy (ios.css lines 34-43: weights, tracking, which size steps up from
// which), one step more compact for phones. iOS point sizes copied 1:1 read about 6 % larger on Android at
// the same dp; body 16 is Material's body size. Letter spacing is the reference's em value times the size.
// Text still scales with the phone's font size setting.
const t = (fontSize: number, lineHeight: number, fontWeight: TextStyle['fontWeight'], em = 0): TextStyle => ({
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing: Math.round(em * fontSize * 100) / 100,
});
export const TYPE = {
  large: t(30, 36, '700', 0.011),
  title2: t(20, 25, '700', 0.015),
  title3: t(18, 23, '600'),
  section: t(18, 23, '600', -0.022),
  headline: t(16, 21, '600', -0.0255),
  body: t(16, 21, '400', -0.0255),
  button: t(16, 21, '500', -0.0255),
  bar: t(15, 20, '600', -0.015),
  sub: t(14, 19, '400', -0.015),
  foot: t(13, 17, '400', -0.005),
  cap: t(12, 15, '400'),
  seg: t(13, 17, '500'),
  tab: t(10, 12, '600'),
} as const;

// Geometry (dp), compact density. Page margin 16 on phones, 20 from 600 (tablets). Rows keep a 44dp minimum
// (the touch target); padding, not fixed heights, sets their size, so larger text grows them naturally.
export const gutter = (width: number) => (width < 600 ? 16 : 20);
export const RADIUS = 22; // grouped card
export const ROW_H = 46; // one-line row
export const ROW_PAD = 11; // row padding above and below its text
export const ROW_X = 16; // row inset
export const SEP_ICON = 59; // separator start after a 29dp icon tile
export const BAR_H = 56; // navigation bar
export const CONTROL_H = 44; // buttons, text fields, glass buttons
export const FIELD_RADIUS = 12;
export const MAX_WIDTH = 720; // Warrantly's content cap on tablets (not in the reference)

// Room for side-by-side content: true while the page's content column, in text-size-adjusted dp, is at least
// `needed` wide. One rule for every "beside or below" choice (label and value, action pairs, badges), so
// larger text or narrow phones stack them at the same point everywhere.
export function useRoom(): (needed: number) => boolean {
  const { width, fontScale } = useWindowDimensions();
  const content = Math.min(width, MAX_WIDTH) - 2 * gutter(width);
  return (needed) => content / fontScale >= needed;
}

// Width of a label's longest word at font scale 1, in dp (Roboto averages a little under 0.6 em per character).
// A box narrower than that breaks the word in the middle ("Megnéze|m"), so controls that share a line check
// that every word fits and stack (or drop an icon) otherwise.
export const wordWidth = (label: string, size = 16): number => Math.max(0, ...label.split(/\s+/).map((w) => w.length)) * size * 0.6;

// Text-adjusted dp two icon Buttons need side by side (padding 2 × 16, icon 20, gap 6, 8 between them), plus the
// inset of the box they sit in. Never below 240, the narrowest a pair still looks calm. For useRoom().
export const pairWidth = (a: string, b: string, inset = 0): number => Math.max(240, 2 * (58 + wordWidth(`${a} ${b}`)) + 8) + inset;

// Motion (ios.css lines 45-48, 85; chrome.js). Springs: the reference's response/damping as stiffness/damping.
export const SPRING = { stiffness: 223.8, damping: 23.34, mass: 1 }; // response .42 s, damping ratio .78
export const SPRING_BOUNCE = { stiffness: 223.8, damping: 18.55, mass: 1 }; // damping ratio .62
export const SHEET_SPRING = { stiffness: 520, damping: 46, mass: 1 }; // chrome.js makeSheet
export const EASE = [0.23, 1, 0.32, 1] as const;
