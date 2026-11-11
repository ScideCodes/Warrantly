import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
        <View style={styles.key}>{extra}</View>
        {key('0')}
        <Pressable style={({ pressed }) => [styles.key, pressed && styles.pressed]} onPress={onDelete} accessibilityRole="button" accessibilityLabel={t('lock.delete')}>
          <Text style={styles.keyText}>⌫</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 32 },
  dots: { flexDirection: 'row', gap: 16, minHeight: 16 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.text },
  dotFilled: { backgroundColor: colors.text },
  grid: { width: 264, flexDirection: 'row', flexWrap: 'wrap', gap: 24, justifyContent: 'center' },
  key: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.expired.bg },
  keyText: { fontSize: 28, fontWeight: '500', color: colors.text },
});
