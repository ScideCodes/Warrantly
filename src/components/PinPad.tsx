import { Pressable, Text, View } from '@/components/themeMotion';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import AppIcon, { type IconName } from '@/components/Icon';
import { glass, reduceMotion, useGlassPress } from '@/components/ui';
import { GlassFill } from '@/components/GlassFill';
import { colors, CONTROL_H, isDarkNow, TYPE, themed } from '@/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Keep circular glass keys comfortably inside narrow phones and short screens.
export function usePinKeySize() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const usableHeight = height - insets.top - insets.bottom;
  return Math.floor(Math.max(48, Math.min(usableHeight < 700 ? 56 : usableHeight < 820 ? 64 : 72, (width - 88) / 3)));
}

function PinKey({ size, label, onPress, disabled, children, plain, testID }: { size: number; label: string; onPress: () => void; disabled?: boolean; children: ReactNode; plain?: boolean; testID?: string }) {
  const styles = useStyles();
  // Interactive glass: swells, lights up under the finger and settles on the bouncy spring (useGlassPress).
  const press = useGlassPress();
  return (
    <Animated.View style={[{ transform: [{ scale: press.scale }] }, disabled && styles.disabled]}>
      <Pressable
        testID={testID}
        style={({ pressed }) => [
          styles.key,
          { width: size, height: size, borderRadius: size / 2 },
          !plain && glass(),
          plain && pressed && { backgroundColor: colors.select },
        ]}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
      >
        {plain ? (
          <>
            {children}
            {press.touch /* measures the key, so the swell stays SWELL dp */}
          </>
        ) : (
          <GlassFill radius={size / 2} sheen={false} style={styles.key}>
            {press.light}
            {children}
            {press.touch}
          </GlassFill>
        )}
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
  const styles = useStyles();
  const { t } = useTranslation();
  const size = usePinKeySize();
  const x = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!shake || reduceMotion()) return;
    x.setValue(0);
    const animation = Animated.sequence([-8, 8, -5, 5, 0].map((toValue) => Animated.timing(x, { toValue, duration: 45, useNativeDriver: true })));
    animation.start();
    return () => animation.stop();
  }, [shake, x]);
  const gap = 24;
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
      <View style={[styles.grid, { width: size * 3 + gap * 2, columnGap: gap, rowGap: 12 }]}>
        {KEYS.map(key)}
        {extra ? (
          <PinKey size={size} label={extra.label} onPress={extra.onPress} plain testID="pin-biometric">
            <AppIcon name={extra.icon} size={28} color={colors.tint} />
          </PinKey>
        ) : (
          <View style={{ width: size, height: size }} />
        )}
        {key('0')}
        {/* Delete appears once there is something to delete, as on the system passcode screen. */}
        <View style={{ width: size, height: size, opacity: empty ? 0 : 1 }} importantForAccessibility={empty ? 'no-hide-descendants' : 'auto'}>
          <PinKey size={size} label={t('lock.delete')} onPress={onDelete} disabled={empty || disabled} plain testID="pin-delete">
            <AppIcon name="backspace-outline" size={24} color={colors.ink} />
          </PinKey>
        </View>
      </View>
    </View>
  );
}

// One balanced column for unlock and setup. Message and footer space stay reserved
// across errors and confirmation, so a status change never moves the keypad.
export function PinLayout({ icon, title, message, error, pad, footer, top = 0, step }: { icon: IconName; title: string; message: string; error?: boolean; pad: ReactNode; footer?: ReactNode; top?: number; step?: 1 | 2 }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { fontScale, height } = useWindowDimensions();
  const usableHeight = height - top - insets.bottom - 36;
  const compact = usableHeight / Math.max(1, fontScale) < 650;
  return (
    <View style={styles.screen}>
      {/* Stands in for the blurred wallpaper behind the system passcode: the glass keys get colour to refract,
          and a dark screen that is not flat black is less likely to be dimmed by the phone. */}
      <View pointerEvents="none" style={styles.backdrop} />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { justifyContent: compact ? 'flex-start' : 'center', gap: compact ? 16 : 24, paddingTop: top + 16, paddingBottom: insets.bottom + 24 }]} bounces={false} overScrollMode="never">
        <View style={styles.head}>
          {/* Decorative: short phones drop it so the keys and the button fit without scrolling. */}
          {!compact && (
            <View
              style={[
                styles.tile,
                glass(),
              ]}
              importantForAccessibility="no-hide-descendants"
            >
              <GlassFill radius={22} sheen={false} style={styles.key}>
                <AppIcon name={icon} size={28} color={colors.tint} />
              </GlassFill>
            </View>
          )}
          {!compact && <Text style={styles.brand}>Warrantly</Text>}
          <Text style={[styles.title, { minHeight: 30 * fontScale * (fontScale > 1.2 ? 2 : 1) }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.message, { minHeight: (TYPE.sub.lineHeight ?? 20) * 2 * Math.min(fontScale, 2) }, error && styles.error]} accessibilityLiveRegion="polite">
            {message}
          </Text>
          {step && <View style={styles.steps} accessible accessibilityRole="progressbar" accessibilityLabel={t('pin.step', { current: step })} accessibilityValue={{ min: 1, max: 2, now: step }}>
            <View style={[styles.step, styles.stepActive]} />
            <View style={[styles.step, step === 2 && styles.stepActive]} />
            <Text style={styles.stepLabel}>{t('pin.step', { current: step })}</Text>
          </View>}
        </View>
        {/* The same keypad geometry is used in every state. */}
        <View style={styles.pad}>{pad}</View>
        <View style={styles.footer}>{footer}</View>
      </ScrollView>
    </View>
  );
}

const useStyles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundImage: isDarkNow()
      ? `radial-gradient(130% 55% at 50% 0%, ${colors.tint}66, transparent 75%), radial-gradient(120% 50% at 50% 100%, ${colors.tint}40, transparent 75%)`
      : `radial-gradient(130% 55% at 50% 0%, ${colors.tint}38, transparent 75%), radial-gradient(120% 50% at 50% 100%, ${colors.tint}24, transparent 75%)`,
  },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, gap: 24 },
  pad: { alignItems: 'center' },
  head: { alignItems: 'center', gap: 8, maxWidth: 312, width: '100%' },
  tile: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  brand: { ...TYPE.cap, fontWeight: '500', color: colors.ink2 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.4, color: colors.ink, textAlign: 'center', textAlignVertical: 'center' },
  message: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', maxWidth: 288 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 4 },
  step: { width: 20, height: 3, borderRadius: 2, backgroundColor: colors.fill2 },
  stepActive: { backgroundColor: colors.tint },
  stepLabel: { ...TYPE.cap, color: colors.ink2, marginLeft: 4 },
  error: { color: colors.bad },
  footer: { minHeight: CONTROL_H, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', maxWidth: 312, width: '100%' },
  wrap: { alignItems: 'center', gap: 24 },
  dots: { flexDirection: 'row', gap: 14, minHeight: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: colors.ink2, backgroundColor: colors.fill },
  dotFilled: { backgroundColor: colors.ink, borderColor: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  keyText: { fontSize: 30, lineHeight: 38, fontWeight: '400', fontVariant: ['tabular-nums'], color: colors.ink, includeFontPadding: false },
}));
