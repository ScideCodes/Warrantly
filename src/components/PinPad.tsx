import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppIcon from '@/components/Icon';
import { colors, TYPE } from '@/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Number pad with entry dots, shared by the lock screen and PIN setup.
export function PinPad({ value, dots, onDigit, onDelete, extra }: { value: string; dots: number; onDigit: (d: string) => void; onDelete: () => void; extra?: ReactNode }) {
  const { t } = useTranslation();
  const key = (d: string) => (
    <Pressable key={d} style={({ pressed }) => [styles.key, pressed && styles.pressed]} onPress={() => onDigit(d)} accessibilityRole="button" accessibilityLabel={d}>
      <Text style={styles.keyText}>{d}</Text>
    </Pressable>
  );
  return (
    <View style={styles.wrap}>
      <View style={styles.dots} accessibilityLabel={`${value.length} / ${dots}`}>
        {Array.from({ length: dots }, (_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map(key)}
        <View style={[styles.key, styles.plain]}>{extra}</View>
        {key('0')}
        <Pressable style={({ pressed }) => [styles.key, styles.plain, pressed && styles.pressed]} onPress={onDelete} accessibilityRole="button" accessibilityLabel={t('lock.delete')}>
          <AppIcon name="backspace-outline" size={28} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

// Keys are 78 wide: big enough for any thumb, three still fit a small phone. The reference has no keypad:
// keys use its --fill circles, Title 2 digits and --fill-2 while pressed.
export const KEY_SIZE = 78;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 36 },
  dots: { flexDirection: 'row', gap: 16, minHeight: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.ink2 },
  dotFilled: { backgroundColor: colors.ink, borderColor: colors.ink },
  grid: { width: KEY_SIZE * 3 + 40, flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 16 },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  plain: { backgroundColor: 'transparent' },
  pressed: { backgroundColor: colors.fill2 },
  keyText: { ...TYPE.title2, fontWeight: '500', color: colors.ink },
});
