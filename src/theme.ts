import { Appearance } from 'react-native';
import { getThemeSetting } from '@/settings';

// shortcut: placeholder palettes until the design pass; screens read colors only from here.
type Hex = `#${string}`;
type Pill = { fg: Hex; bg: Hex };
export interface Palette {
  background: Hex;
  text: Hex;
  muted: Hex;
  border: Hex;
  primary: Hex;
  primaryDisabled: Hex;
  onPrimary: Hex;
  ok: Pill;
  warning: Pill;
  soon: Pill;
  expired: Pill;
  banner: Hex;
}

export const lightColors: Palette = {
  background: '#FFFFFF',
  text: '#111827',
  muted: '#4B5563', // 7.6:1 on white
  border: '#6B7280', // 4.8:1, input borders need 3:1
  primary: '#1D4ED8', // 6.7:1 with white text
  primaryDisabled: '#93A5D8',
  onPrimary: '#FFFFFF',
  // Days-left pills: dark text on a light tint, each pair above 4.5:1.
  ok: { fg: '#166534', bg: '#DCFCE7' },
  warning: { fg: '#92400E', bg: '#FEF3C7' },
  soon: { fg: '#991B1B', bg: '#FEE2E2' },
  expired: { fg: '#374151', bg: '#F3F4F6' },
  banner: '#FEF3C7',
};

// Dark mode (section 13): light text on near-black; every text pair stays above 4.5:1.
const darkColors: Palette = {
  background: '#111827',
  text: '#F9FAFB', // 16:1
  muted: '#9CA3AF', // 6.9:1
  border: '#6B7280', // 3.3:1
  primary: '#93C5FD', // 10:1 as text; buttons use dark text on it
  primaryDisabled: '#4B5563',
  onPrimary: '#111827',
  ok: { fg: '#BBF7D0', bg: '#14532D' },
  warning: { fg: '#FDE68A', bg: '#78350F' },
  soon: { fg: '#FECACA', bg: '#7F1D1D' },
  expired: { fg: '#E5E7EB', bg: '#374151' },
  banner: '#78350F',
};

// Chosen once at start: styles are created when screens load, so a change applies after a restart
// (Settings restarts the app when you pick a theme).
export const isDark = (getThemeSetting() === 'system' ? Appearance.getColorScheme() : getThemeSetting()) === 'dark';
export const colors: Palette = isDark ? darkColors : lightColors;
