import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Warranty } from '@/db/repo.ts';
import { colors } from '@/theme';
import { ago, daysUntil, todayYmd, urgency } from '@/warranty';

export function daysLabel(t: TFunction, daysLeft: number): string {
  if (daysLeft < 0) return t('warranty.expiredAgo', { count: -daysLeft });
  return daysLeft === 0 ? t('warranty.expiresToday') : t('warranty.daysLeft', { count: daysLeft });
}

export function lengthLabel(t: TFunction, w: Warranty): string {
  const months = t('warranty.months', { count: w.warranty_months });
  return w.length_is_suggested ? t('warranty.suggested', { value: months }) : months;
}

export function agoLabel(t: TFunction, ymd: string, today: string): string {
  const { unit, count } = ago(ymd, today);
  return unit === 'days' && count === 0 ? t('warranty.today') : t(`warranty.ago_${unit}`, { count });
}

export function formatDate(ymd: string, language: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function WarrantyRow({ warranty: w }: { warranty: Warranty }) {
  const { t } = useTranslation();
  const today = todayYmd();
  const days = daysUntil(w.end_date, today);
  const pill = colors[urgency(days)];
  const product = w.product_name ?? t('warranty.unknownProduct');

  return (
    <Pressable style={styles.row} onPress={() => router.push(`/warranty/${w.id}`)} accessibilityRole="button">
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {product}
        </Text>
        <Text style={styles.meta}>
          {w.store_name} · {t('warranty.purchased', { ago: agoLabel(t, w.purchase_date, today) })}
        </Text>
      </View>
      <View style={[styles.pill, { backgroundColor: pill.bg }]}>
        <Text style={[styles.pillText, { color: pill.fg }]}>{daysLabel(t, days)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
  pill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 140 },
  pillText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
