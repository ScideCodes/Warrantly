import { Text, View, useThemeTransition } from '@/components/themeMotion';
import { forwardRef, useContext, useState, type ComponentRef, type ReactNode } from 'react';
import { DOCK_SPACE, InDock } from '@/components/Dock';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, type FlatListProps, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { goBack } from '@/nav';
import { BAR_H, colors, gutter, isDarkNow, MAX_WIDTH, TYPE, themed } from '@/theme';
import { GlassButton } from '@/components/ui';
import Reanimated from 'react-native-reanimated';

// The page shell of every screen: floating glass buttons over a soft scroll edge, a compact title that
// fades in once the large title has passed under the bar (chrome.js `--t`), and the large title itself.
// The page colour as an rgb triple, for the scroll-edge gradients.
// The bar's ::before: --bg fading out downwards past the bar (ios.css line 165). The reference blurs what scrolls
// under it by 8px, which React Native cannot, so the page colour stays solid behind the bar's own height (the
// title and buttons never sit over ghost text) and fades out over the EDGE dp below it.
const EDGE = 28;
const edgeGradient = (rgb: string, solid: number) => `linear-gradient(rgba(${rgb},1) ${solid}px, rgba(${rgb},0) ${solid + EDGE}px)`;

export function useScrollEdge(listener?: (y: number) => void) {
  const y = useState(() => new Animated.Value(0))[0];
  const [titleH, setTitleH] = useState(41);
  // --t = (bar height - title top) / title height; the title starts 4dp under the bar.
  const t = y.interpolate({ inputRange: [4, 4 + titleH], outputRange: [0, 1], extrapolate: 'clamp' });
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
    useNativeDriver: true,
    listener: listener && ((e: { nativeEvent: { contentOffset: { y: number } } }) => listener(e.nativeEvent.contentOffset.y)),
  });
  return { t, onScroll, onTitleLayout: (h: number) => setTitleH(Math.max(h, 1)) };
}

// No scroll to follow: the compact title is always shown.
const ALWAYS = new Animated.Value(1).interpolate({ inputRange: [0, 1], outputRange: [1, 1] });

export function NavBar({ title, t, back = true, leading, trailing }: { title?: string; t?: Animated.AnimatedInterpolation<number>; back?: boolean; leading?: ReactNode; trailing?: ReactNode }) {
  const styles = useStyles();
  const transition = useThemeTransition();
  const dark = isDarkNow();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [leadingWidth, setLeadingWidth] = useState(44);
  const [trailingWidth, setTrailingWidth] = useState(44);
  const sideWidth = Math.max(44, leadingWidth, trailingWidth);
  const show = t ?? ALWAYS;
  const solid = BAR_H + insets.top - 4;
  const lightEdge = { ...StyleSheet.absoluteFill, backgroundImage: edgeGradient('242,242,247', solid) };
  const darkEdge = { ...StyleSheet.absoluteFill, backgroundImage: edgeGradient('0,0,0', solid) };
  const titleOpacity = show.interpolate({ inputRange: [0.55, 0.95], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <View style={[styles.bar, { height: BAR_H + insets.top, paddingTop: insets.top }]} pointerEvents="box-none">
      <Animated.View style={[styles.edge, { opacity: show }]} pointerEvents="none">
        {/* Crossfade fixed gradients: changing the gradient string would flash the entire scroll edge. */}
        <Reanimated.View style={[lightEdge, transition, { transitionProperty: ['opacity'], opacity: dark ? 0 : 1 }]} />
        <Reanimated.View style={[darkEdge, transition, { transitionProperty: ['opacity'], opacity: dark ? 1 : 0 }]} />
      </Animated.View>
      <View style={[styles.barIn, { paddingHorizontal: gutter(width) }]} pointerEvents="box-none">
        <View style={[styles.side, { minWidth: sideWidth }]}>
          <View style={styles.sideContent} onLayout={(e) => setLeadingWidth(e.nativeEvent.layout.width)}>{leading ?? (back && <GlassButton icon="chevron-back" size={22} label={tr('nav.back')} onPress={goBack} testID="nav-back" />)}</View>
        </View>
        <Animated.Text
          style={[styles.title, { opacity: titleOpacity, transform: [{ translateY: titleOpacity.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }]}
          numberOfLines={1}
          importantForAccessibility="no" // the large title below is the heading
        >
          {title}
        </Animated.Text>
        <View style={[styles.side, styles.trail, { minWidth: sideWidth }]}>
          <View style={styles.sideContent} onLayout={(e) => setTrailingWidth(e.nativeEvent.layout.width)}>{trailing}</View>
        </View>
      </View>
    </View>
  );
}

export function LargeTitle({ title, lead, onLayout }: { title: string; lead?: string; onLayout?: (h: number) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.head}>
      <Text style={styles.large} accessibilityRole="header" onLayout={(e) => onLayout?.(e.nativeEvent.layout.height)}>
        {title}
      </Text>
      {lead ? <Text style={styles.lead}>{lead}</Text> : null}
    </View>
  );
}

// `head` replaces the large title (the detail screen's hero); the compact title still fades in past it.
type PageProps = ScrollViewProps & { title: string; lead?: string; head?: ReactNode; back?: boolean; trailing?: ReactNode; children: ReactNode; footer?: ReactNode };

// A scrolling page. `footer` stays fixed under the scroll area (save buttons, the viewer's actions).
export const Page = forwardRef<ComponentRef<typeof ScrollView>, PageProps>(function Page({ title, lead, head, back, trailing, children, footer, contentContainerStyle, ...scroll }, ref) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const edge = useScrollEdge();
  const dock = useContext(InDock) ? DOCK_SPACE : 0; // a tab page leaves room for the dock floating over it
  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.keyboard} behavior="padding">
      <Animated.ScrollView
        ref={ref as never}
        onScroll={edge.onScroll}
        scrollEventThrottle={16}
        overScrollMode="never"
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        {...scroll}
        contentContainerStyle={[{ maxWidth: MAX_WIDTH, width: '100%', alignSelf: 'center', paddingTop: insets.top + BAR_H, paddingHorizontal: gutter(width), paddingBottom: (footer ? 0 : insets.bottom + dock) + 32 }, contentContainerStyle]}
      >
        {head ? <View onLayout={(e) => edge.onTitleLayout(e.nativeEvent.layout.height)}>{head}</View> : <LargeTitle title={title} lead={lead} onLayout={edge.onTitleLayout} />}
        {children}
      </Animated.ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + dock + 12, paddingHorizontal: gutter(width) }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
      <NavBar title={title} t={edge.t} back={back ?? !dock} trailing={trailing} />
    </View>
  );
});

const useStyles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  keyboard: { flex: 1 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: -EDGE },
  barIn: { maxWidth: MAX_WIDTH, width: '100%', alignSelf: 'center', height: BAR_H, flexDirection: 'row', alignItems: 'center', gap: 8 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 44 },
  trail: { justifyContent: 'flex-end', gap: 8 },
  sideContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...TYPE.bar, color: colors.ink, textAlign: 'center', flexShrink: 1, maxWidth: '50%' },
  head: { paddingTop: 4, paddingBottom: 8 },
  large: { ...TYPE.large, color: colors.ink },
  lead: { ...TYPE.sub, color: colors.ink2, marginTop: 2 },
  footer: { maxWidth: MAX_WIDTH, width: '100%', alignSelf: 'center', paddingTop: 12, backgroundColor: colors.bg },
}));

// A page whose body is a long list: the same bar and large title over a FlatList.
export function ListPage<T>({ title, lead, header, contentContainerStyle, ...list }: FlatListProps<T> & { title: string; lead?: string; header?: ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const edge = useScrollEdge();
  return (
    <View style={styles.screen}>
      <Animated.FlatList
        onScroll={edge.onScroll}
        scrollEventThrottle={16}
        overScrollMode="never"
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        {...(list as object)}
        data={list.data as never}
        ListHeaderComponent={
          <>
            <LargeTitle title={title} lead={lead} onLayout={edge.onTitleLayout} />
            {header}
          </>
        }
        contentContainerStyle={[{ maxWidth: MAX_WIDTH, width: '100%', alignSelf: 'center', paddingTop: insets.top + BAR_H, paddingHorizontal: gutter(width), paddingBottom: insets.bottom + 32 }, contentContainerStyle]}
      />
      <NavBar title={title} t={edge.t} />
    </View>
  );
}
