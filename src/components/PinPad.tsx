import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import AppIcon, { type IconName } from '@/components/Icon';
import { glass, reduceMotion, TILE } from '@/components/ui';
import { colors, CONTROL_H, SPRING_BOUNCE, TYPE } from '@/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// The reference has no keypad (docs/visual-reference.md, "does not define"). Keys are its round glass control
// (`.glass-btn`: --material, glass edge and sheen, scale 1.1 on the bounce spring while held) at keypad size,
// with Large Title-sized digits at regular weight. Keys shrink on short screens so the pad never needs scrolling
// at normal text sizes; 60dp still clears the 48dp touch target.
export function usePinKeySize() {
  const { height } = useWindowDimensions();
  return height < 680 ? 60 : height < 760 ? 70 : 78;
}

function PinKey({ size, label, onPress, disabled, children, plain, testID }: { size: number; label: string; onPress: () => void; disabled?: boolean; children: ReactNode; plain?: boolean; testID?: string }) {
  const scale = useState(() => new Animated.Value(1))[0];
  const to = (v: number, fast: boolean) => {
    if (reduceMotion()) return;
    Animated.spring(scale, { toValue: v, useNativeDriver: true, ...(fast ? { stiffness: 1153, damping: 42.1, mass: 1 } : SPRING_BOUNCE) }).start();
  };
  return (
    <Animated.View style={[{ transform: [{ scale }] }, disabled && styles.disabled]}>
      <Pressable
        testID={testID}
        style={[styles.key, { width: size, height: size, borderRadius: size / 2 }, !plain && glass()]}
        onPress={onPress}
        onPressIn={() => to(1.1, true)}
        onPressOut={() => to(1, false)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// Number pad with entry dots, shared by the lock screen and PIN setup. `shake` changes on a wrong PIN: the dots
// shake on a quick spring (app-specific: stiffness 900, damping ratio .3), skipped under reduced motion.
export function PinPad({
  value,
  dots,
  onDigit,
  onDelete,
  extra,
  disabled,
  shake = 0,
}: {
  value: string;
  dots: number;
  onDigit: (d: string) => void;
  onDelete: () => void;
  extra?: { icon: IconName; label: string; onPress: () => void };
  disabled?: boolean;
  shake?: number;
}) {
  const { t } = useTranslation();
  const size = usePinKeySize();
  const x = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!shake || reduceMotion()) return;
    x.setValue(0);
    Animated.spring(x, { toValue: 0, velocity: 0.3, stiffness: 900, damping: 18, mass: 1, useNativeDriver: true }).start();
  }, [shake, x]);
  const gap = Math.round(size * 0.28);
  const key = (d: string) => (
    <PinKey key={d} size={size} label={d} onPress={() => onDigit(d)} disabled={disabled} testID={`pin-key-${d}`}>
      <Text style={styles.keyText} maxFontSizeMultiplier={1.2}>
        {d}
      </Text>
    </PinKey>
  );
  const empty = value.length === 0;
  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.dots, { transform: [{ translateX: x }] }]} accessible accessibilityLabel={`${value.length} / ${dots}`}>
        {Array.from({ length: dots }, (_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
        ))}
      </Animated.View>
      <View style={[styles.grid, { width: size * 3 + gap * 2, columnGap: gap, rowGap: Math.round(gap * 0.75) }]}>
        {KEYS.map(key)}
        {extra ? (
          <PinKey size={size} label={extra.label} onPress={extra.onPress}>
            <AppIcon name={extra.icon} size={Math.round(size * 0.42)} color={colors.tint} />
          </PinKey>
        ) : (
          <View style={{ width: size, height: size }} />
        )}
        {key('0')}
        {/* Delete appears once there is something to delete, as on the system passcode screen. */}
        <View style={{ width: size, height: size, opacity: empty ? 0 : 1 }} importantForAccessibility={empty ? 'no-hide-descendants' : 'auto'}>
          <PinKey size={size} label={t('lock.delete')} onPress={onDelete} disabled={empty} plain testID="pin-delete">
            <AppIcon name="backspace-outline" size={Math.round(size * 0.36)} color={colors.ink} />
          </PinKey>
        </View>
      </View>
    </View>
  );
}

// One composition for every PIN state: the reference's large hero tile (56dp, radius 14, 32dp white glyph), a
// Title 2 heading, a Subheadline message that keeps two lines of room so the pad never jumps, the pad, and a
// footer that also keeps its height when it is empty. Scrolls only when very large text leaves no other way.
export function PinLayout({ icon, title, message, error, pad, footer, top = 0 }: { icon: IconName; title: string; message: string; error?: boolean; pad: ReactNode; footer?: ReactNode; top?: number }) {
  const insets = useSafeAreaInsets();
  const { fontScale, height } = useWindowDimensions();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top + 16, paddingBottom: insets.bottom + 16 }]} bounces={false} overScrollMode="never">
      <View style={styles.head}>
        {/* Decorative: short phones drop it so the keys and the button fit without scrolling. */}
        {height >= 700 && (
          <View style={styles.tile} importantForAccessibility="no-hide-descendants">
            <AppIcon name={icon} size={32} color="#fff" />
          </View>
        )}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[styles.message, { minHeight: (TYPE.sub.lineHeight ?? 20) * 2 * Math.min(fontScale, 2) }, error && styles.error]} accessibilityLiveRegion="polite">
          {message}
        </Text>
      </View>
      {/* Anchored to the bottom, so a longer or shorter message never moves the keys. */}
      <View style={styles.pad}>{pad}</View>
      <View style={styles.footer}>{footer}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24, gap: 24 },
  pad: { marginTop: 'auto' },
  head: { alignItems: 'center', gap: 8, maxWidth: 360 },
  tile: { width: 56, height: 56, borderRadius: 14, backgroundColor: TILE.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { ...TYPE.title2, color: colors.ink, textAlign: 'center' },
  message: { ...TYPE.sub, color: colors.ink2, textAlign: 'center' },
  error: { color: colors.bad },
  footer: { minHeight: CONTROL_H, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  wrap: { alignItems: 'center', gap: 32 },
  dots: { flexDirection: 'row', gap: 16, minHeight: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.ink2 },
  dotFilled: { backgroundColor: colors.ink, borderColor: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  keyText: { fontSize: TYPE.large.fontSize, lineHeight: TYPE.large.lineHeight, fontWeight: '400', color: colors.ink, includeFontPadding: false },
});
