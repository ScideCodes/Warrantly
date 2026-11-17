import { Pressable, Text, View } from '@/components/themeMotion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import AppIcon from '@/components/Icon';
import { Animated, Keyboard, Modal, PanResponder, Platform, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, MAX_WIDTH, ROW_X, SHEET_SPRING, TYPE, themed } from '@/theme';
import { GlassButton, Group, reduceMotion, Row, type IconName } from '@/components/ui';
import { useLocked } from '@/lock/gate';

export type { IconName };

export interface SheetOption {
  key: string;
  label: string;
  icon?: IconName;
  count?: number;
  selected?: boolean;
  destructive?: boolean;
  onPress: () => void;
}
export interface SheetSection {
  title?: string;
  options: SheetOption[];
}

// The reference's phone sheet (ios.css lines 506-563, chrome.js makeSheet): floats 6dp from the sides and
// bottom with 38/58 corners, a 60 x 4 grabber, a 54dp toolbar with a glass close button and a centred title.
// One damped spring (stiffness 520, damping 46) opens, closes and follows the grabber.
// How many sheet Modals are on screen. A dialog opened over one must be a Modal too, or it would draw under it.
let sheetsOpen = 0;
export const isSheetOpen = (): boolean => sheetsOpen > 0;

export function SheetFrame({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const locked = useLocked();
  const [shown, setShown] = useState(open);
  // The translucent Modal can be taller than the activity window on three-button navigation.
  // Measure that actual viewport and use the keyboard's screen position, not its reported height.
  const [modalHeight, setModalHeight] = useState(screenH);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const keyboardHeight = keyboardTop === null ? 0 : Math.max(0, modalHeight - keyboardTop);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', e => setKeyboardTop(e.endCoordinates.screenY));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(null));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  const height = useRef(600); // for the drag handlers
  const [panelH, setPanelH] = useState(600); // for the scrim
  const y = useState(() => new Animated.Value(screenH))[0];
  const yNow = useRef(screenH);
  useEffect(() => {
    const id = y.addListener(({ value }) => (yNow.current = value));
    return () => y.removeListener(id);
  }, [y]);

  const settle = (to: number, velocity = 0, done?: () => void) => {
    if (reduceMotion()) {
      y.setValue(to);
      done?.();
      return;
    }
    Animated.spring(y, { toValue: to, velocity, useNativeDriver: true, restDisplacementThreshold: 0.25, restSpeedThreshold: 3, ...SHEET_SPRING }).start(({ finished }) => finished && done?.());
  };
  if (open && !shown) setShown(true); // mount before the spring starts; it unmounts once closed
  useEffect(() => {
    if (!shown) return;
    sheetsOpen++;
    return () => void sheetsOpen--;
  }, [shown]);
  useEffect(() => {
    if (open) {
      y.setValue(height.current);
      settle(0);
    } else settle(height.current + 32, 0, () => setShown(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // The grabber and toolbar drag; content keeps scrolling. Above the resting point it rubber-bands at .15.
  // Dismiss on distance or a flick: the projected resting point decides (chrome.js).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // eslint-disable-next-line react-hooks/refs -- the handlers read the refs on touch, never during render
  const [drag] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => y.stopAnimation(),
      onPanResponderMove: (_, g) => y.setValue(g.dy < 0 ? g.dy * 0.15 : g.dy),
      onPanResponderRelease: (_, g) => {
        if (yNow.current + g.vy * 1000 * 0.18 > Math.min(130, height.current * 0.35)) onCloseRef.current();
        else settle(0, g.vy);
      },
      onPanResponderTerminate: () => settle(0),
    }),
  );

  if (!shown) return null;
  const dim = y.interpolate({ inputRange: [0, Math.max(panelH, 1)], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <Modal visible={!locked} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: dim }]} onLayout={e => setModalHeight(e.nativeEvent.layout.height)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('sheet.close')} />
      </Animated.View>
      <Animated.View
        onLayout={(e) => {
          height.current = e.nativeEvent.layout.height;
          setPanelH(e.nativeEvent.layout.height);
        }}
        style={[styles.panel, { width: Math.min(screenW - 12, MAX_WIDTH), left: (screenW - Math.min(screenW - 12, MAX_WIDTH)) / 2, right: undefined, bottom: keyboardHeight + 6, maxHeight: Math.max(150, modalHeight - insets.top - keyboardHeight - 12), paddingBottom: keyboardHeight ? 8 : Math.max(0, insets.bottom - 6), transform: [{ translateY: y }] }]}
        accessibilityViewIsModal
      >
        <View {...drag.panHandlers}>
          <View style={styles.grab}>
            <View style={styles.grabber} />
          </View>
          <View style={styles.toolbar}>
            <GlassButton testID="sheet-close" icon="close" size={18} label={t('sheet.close')} onPress={onClose} />
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            <View style={styles.toolbarEnd} />
          </View>
        </View>
        {children}
      </Animated.View>
    </Modal>
  );
}

// Free content in a sheet, scrolling with the same insets as the option lists.
export function SheetBody({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={Platform.OS === 'android'}
      decelerationRate="normal"
    >
      {children}
    </ScrollView>
  );
}

// Choices and less-used actions (filter, add a document, more actions) as grouped rows in a sheet.
export function Sheet({ open, onClose, title, subtitle, sections }: { open: boolean; onClose: () => void; title: string; subtitle?: string; sections: SheetSection[] }) {
  const styles = useStyles();
  return (
    <SheetFrame open={open} onClose={onClose} title={title}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === 'android'}
        decelerationRate="normal"
      >
        {subtitle ? <Text style={styles.note}>{subtitle}</Text> : null}
        {sections.map((s, i) => (
          <View key={i}>
            {s.title ? (
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {s.title}
              </Text>
            ) : (
              i > 0 && <View style={styles.gap} />
            )}
            <Group inSheet>
              {s.options.map((o, j) => (
                <Row
                  key={o.key}
                  separator={j > 0}
                  iconInset={!!o.icon}
                  selected={o.selected}
                  onPress={() => {
                    onClose();
                    o.onPress();
                  }}
                >
                  {o.icon && (
                    <View style={styles.glyph}>
                      <AppIcon name={o.icon} size={22} color={o.destructive ? colors.bad : colors.tint} />
                    </View>
                  )}
                  <Text style={[styles.label, o.selected && styles.labelSelected, o.destructive && { color: colors.bad }]}>{o.label}</Text>
                  {o.count !== undefined && <Text style={[styles.count, o.selected && { color: colors.tintInk }]}>{o.count}</Text>}
                </Row>
              ))}
            </Group>
          </View>
        ))}
      </ScrollView>
    </SheetFrame>
  );
}

const useStyles = themed(() => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.dim },
  panel: { position: 'absolute', left: 6, right: 6, bottom: 6, backgroundColor: colors.sheetBg, borderTopLeftRadius: 38, borderTopRightRadius: 38, borderBottomLeftRadius: 58, borderBottomRightRadius: 58, boxShadow: colors.shadow, overflow: 'hidden' },
  grab: { height: 10, paddingTop: 6, alignItems: 'center' },
  grabber: { width: 60, height: 4, borderRadius: 2, backgroundColor: colors.grabber },
  toolbar: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  title: { ...TYPE.bar, flex: 1, color: colors.ink, textAlign: 'center', paddingHorizontal: 4 },
  toolbarEnd: { width: 44 },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  content: { paddingTop: 4, paddingHorizontal: 16, paddingBottom: 24 },
  note: { ...TYPE.sub, color: colors.ink2, paddingHorizontal: ROW_X, paddingBottom: 12 },
  sectionTitle: { ...TYPE.headline, color: colors.ink, marginTop: 22, marginBottom: 7, paddingHorizontal: 4 },
  gap: { height: 22 },
  glyph: { width: 29, alignItems: 'center' },
  label: { ...TYPE.body, flex: 1, color: colors.ink },
  labelSelected: { color: colors.tintInk, fontWeight: '600' },
  count: { ...TYPE.body, fontVariant: ['tabular-nums'], color: colors.ink2 },
}));
