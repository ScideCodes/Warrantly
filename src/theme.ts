import { Appearance } from 'react-native';
import { getThemeSetting } from '@/settings';

// "Clean Card" look (design canvas, round 3, look 1): grey page, white cards, one blue; dark is OLED black.
// Screens read colors only from here.
type Hex = `#${string}`;
type Pill = { fg: Hex; bg: Hex };
export interface Palette {
  background: Hex; // the page behind the cards
  text: Hex;
  muted: Hex;
  border: Hex; // inputs and outlined buttons (3:1)
  divider: Hex; // hairline list separators, decorative
  primary: Hex;
  primaryDisabled: Hex;
  onPrimary: Hex;
  primarySoft: Hex; // tinted backgrounds: letter tiles, icon tiles, the selected bottom-bar item
  ok: Pill;
  warning: Pill;
  soon: Pill;
  expired: Pill;
  banner: Hex;
  surface: Hex; // cards on the page (lists, settings groups, search box)
}

export const lightColors: Palette = {
  background: '#F2F3F5',
  text: '#0E1116',
  muted: '#5B6270', // 5.5:1 on the page, 6.2:1 on white
  border: '#8A919C', // 3.2:1 on white cards and fields
  divider: '#E6E8EC',
  primary: '#2457F5', // 5.3:1 with white text
  primaryDisabled: '#A9BCF9',
  onPrimary: '#FFFFFF',
  primarySoft: '#E8EEFF',
  // Days left: tinted pairs, each above 4.5:1.
  ok: { fg: '#166534', bg: '#DCFCE7' },
  warning: { fg: '#92400E', bg: '#FEF3C7' },
  soon: { fg: '#C2410C', bg: '#FFEDD5' }, // orange, not red: tells apart from green for colour-blind eyes
  expired: { fg: '#374151', bg: '#F3F4F6' },
  banner: '#FEF3C7',
  surface: '#FFFFFF',
};

// OLED dark (section 13): true black page, so unlit pixels stay off; cards lift by tone, not shadow.
const darkColors: Palette = {
  background: '#000000',
  text: '#F5F5F7', // 19:1
  muted: '#A1A1AA', // 8:1
  border: '#6B6B73', // 3.6:1
  divider: '#26262A',
  primary: '#5B8CFF', // 6.6:1 as text; buttons use black text on it
  primaryDisabled: '#2A3A66',
  onPrimary: '#000000',
  primarySoft: '#13224A',
  ok: { fg: '#BBF7D0', bg: '#14532D' },
  warning: { fg: '#FDE68A', bg: '#78350F' },
  soon: { fg: '#FF9F5A', bg: '#3A1A06' },
  expired: { fg: '#E5E7EB', bg: '#1C1C1F' },
  banner: '#3D2A05',
  surface: '#141416',
};

// Chosen once at start: styles are created when screens load, so a change applies after a restart
// (Settings restarts the app when you pick a theme).
export const isDark = (getThemeSetting() === 'system' ? Appearance.getColorScheme() : getThemeSetting()) === 'dark';
export const colors: Palette = isDark ? darkColors : lightColors;

// Every button and text field is at least this tall, so the app has one button size. Text may wrap:
// the height grows with it instead of the text shrinking.
export const BUTTON_HEIGHT = 52;
export const BUTTON_RADIUS = 14;

// Shared spacing (dp): screen edges, padding inside a group, and the gap between sections.
export const SPACE = { screen: 20, group: 16, section: 24 } as const;
// Shared text sizes (sp).
export const FONT = { title: 28, heading: 19, body: 17, small: 15 } as const;
export const CARD_RADIUS = 16;
