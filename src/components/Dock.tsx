import { Pressable, Text, View } from '@/components/themeMotion';
import { createContext, useEffect, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { BottomTabBarProps } from 'expo-router/tabs';
import AppIcon, { type IconName } from '@/components/Icon';
import { glass, reduceMotion } from '@/components/ui';
import { GlassFill } from '@/components/GlassFill';
import { colors, isDarkNow, SPRING, SPRING_BOUNCE, TYPE, themed } from '@/theme';

// Room a tab page keeps free at the bottom for the dock floating over it (bar 54 + 8 gap + some air).
export const DOCK_SPACE = 72;
// Tab pages start their on-focus reload after the 150 ms tab slide, so its re-render does not land mid-slide.
export const AFTER_SLIDE_MS = 180;
// Set on the tab pages: Page adds DOCK_SPACE at the bottom and shows no back button.
export const InDock = createContext(false);
// The Add tab's form calls this when it is done (saved), instead of going back.
export const FormDone = createContext<(() => void) | null>(null);

type Tab = { name: string; icon: IconName; iconOn?: IconName; label: string; accessibilityLabel?: string; testID: string };

// The glass dock of the three main pages. It stays on screen; switching slides the page and the lens.
export function Dock({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tabH, setTabH] = useState(46);
  const tabs: Tab[] = [
    { name: 'index', icon: 'shield-checkmark-outline', iconOn: 'shield-checkmark', label: t('home.title'), testID: 'tab-list' },
    { name: 'add', icon: 'add-circle-outline', label: t('home.add'), accessibilityLabel: t('home.addLong'), testID: 'tab-add' },
    { name: 'settings', icon: 'settings-outline', label: t('settings.title'), testID: 'tab-settings' },
  ];
  const barW = Math.min(300, width - 64);
  const tabW = (barW - 8) / tabs.length;
  const current = state.routes[state.index]?.name;
  const at = Math.max(0, tabs.findIndex((tab) => tab.name === current));
  const [x] = useState(() => new Animated.Value(at * tabW));
  useEffect(() => {
    if (reduceMotion()) x.setValue(at * tabW);
    else Animated.spring(x, { toValue: at * tabW, useNativeDriver: true, ...SPRING }).start();
  }, [at, tabW, x]);
  const press = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (current !== name && !event.defaultPrevented) navigateToTab(route.key);
  };
  return (
    <>
      <View style={[styles.scrollEdge, { height: 80 + insets.bottom }]} pointerEvents="none" />
      <View style={[styles.tabbar, glass(), { width: barW, bottom: insets.bottom + 8 }]} accessibilityRole="tablist">
        <GlassFill flow radius={27} sheen={false} style={styles.tabRow}>
          <Animated.View style={[styles.lens, { top: 4, height: tabH, width: tabW, left: 4, transform: [{ translateX: x }] }]} pointerEvents="none" />
          {tabs.map((tab, i) => (
            <View key={tab.name} style={styles.tabSlot} onLayout={i === at ? (e) => setTabH(e.nativeEvent.layout.height) : undefined}>
              <TabButton tab={tab} on={i === at} onPress={() => press(tab.name)} />
            </View>
          ))}
        </GlassFill>
      </View>
    </>
  );
}

function TabButton({ tab, on, onPress }: { tab: Tab; on: boolean; onPress: () => void }) {
  const styles = useStyles();
  const scale = useState(() => new Animated.Value(1))[0];
  const press = (v: number) => {
    if (!reduceMotion()) Animated.spring(scale, { toValue: v, useNativeDriver: true, ...SPRING_BOUNCE }).start();
  };
  return (
    <Pressable testID={tab.testID} style={styles.tab} onPress={onPress}
      onPressIn={() => press(0.86)} onPressOut={() => press(1)}
      accessibilityRole="tab" accessibilityLabel={tab.accessibilityLabel ?? tab.label} accessibilityState={{ selected: on }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <AppIcon name={on && tab.iconOn ? tab.iconOn : tab.icon} size={22} color={on ? colors.tint : colors.ink} />
      </Animated.View>
      <Text style={[styles.tabLabel, on && { color: colors.tintInk }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{tab.label}</Text>
    </Pressable>
  );
}

// The page colour as an rgb triple, for the scroll-edge gradient.
const rgb = () => (isDarkNow() ? '0,0,0' : '242,242,247');
const useStyles = themed(() => StyleSheet.create({
  // The phone scroll edge under the tab bar (ios.css lines 704-706); dark mode at .35.
  scrollEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    opacity: isDarkNow() ? 0.35 : 1,
    backgroundImage: `linear-gradient(rgba(${rgb()},0) 0%, rgba(${rgb()},0.45) 60%, rgba(${rgb()},0.75) 100%)`,
  },
  tabbar: { position: 'absolute', alignSelf: 'center', borderRadius: 27 },
  tabRow: { flexDirection: 'row', padding: 4 },
  lens: { position: 'absolute', borderRadius: 23, backgroundColor: colors.select },
  tabSlot: { flex: 1, minWidth: 0 },
  tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 23, paddingHorizontal: 2 },
  tabLabel: { ...TYPE.tab, color: colors.ink, maxWidth: '100%' },
}));
