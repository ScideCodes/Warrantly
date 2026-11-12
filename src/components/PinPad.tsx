import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/theme';

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
          <Ionicons name="backspace-outline" size={30} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

// Keys are 78 wide: big enough for any thumb, three still fit a small phone.
export const KEY_SIZE = 78;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 36 },
  dots: { flexDirection: 'row', gap: 16, minHeight: 16 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.border },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  grid: { width: KEY_SIZE * 3 + 40, flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 16 },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  plain: { backgroundColor: 'transparent' },
  pressed: { backgroundColor: colors.primarySoft },
  keyText: { fontSize: 30, fontWeight: '500', color: colors.text },
});
