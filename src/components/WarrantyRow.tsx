import { router, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Warranty } from '@/db/repo.ts';
import { documentUriOrNull } from '@/documents';
import { colors } from '@/theme';
import { ago, daysUntil, shortName, todayYmd, urgency } from '@/warranty';

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

// Imported names get shortened for the list; names the user typed are shown as typed.
export function displayName(t: TFunction, w: Warranty): string {
  if (!w.product_name) return t('warranty.unknownProduct');
  return w.origin === 'manual' ? w.product_name : shortName(w.product_name);
}

// "105 263 Ft", "49,90 €"; falls back to "105263 HUF" if the engine lacks that currency.
export function formatMoney(amount: number, currency: string, language: string): string {
  try {
    return amount.toLocaleString(language, { style: 'currency', currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 });
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatDate(ymd: string, language: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' });
}

// `to` overrides where a tap goes (the attention list opens the resolve form directly).
export function WarrantyRow({ warranty: w, to }: { warranty: Warranty; to?: Href }) {
  const { t } = useTranslation();
  const today = todayYmd();
  const days = daysUntil(w.end_date, today);
  const pill = colors[urgency(days)];
  const product = displayName(t, w);

  return (
    <Pressable style={styles.row} onPress={() => router.push(to ?? `/warranty/${w.id}`)} accessibilityRole="button">
      {/* Photo if there is one, else the first letter (like a sender in Gmail): rows are easier to tell apart. */}
      {w.photo_path && documentUriOrNull(w.photo_path) ? (
        <Image source={{ uri: documentUriOrNull(w.photo_path)! }} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.letter} importantForAccessibility="no-hide-descendants">
          <Text style={styles.letterText}>{product.trim().charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {product}
        </Text>
        <Text style={styles.meta}>
          {w.store_name} · {w.coverage ? `${t(`coverage.${w.coverage}`)} · ` : ''}
          {t('warranty.purchased', { ago: agoLabel(t, w.purchase_date, today) })}
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
    borderBottomColor: colors.divider,
  },
  thumb: { width: 44, height: 44, borderRadius: 22 },
  letter: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  letterText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
  pill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 140 },
  pillText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
