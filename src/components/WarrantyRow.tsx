import { router, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Warranty } from '@/db/repo.ts';
import { documentUriOrNull } from '@/documents';
import { colors } from '@/theme';
import { ago, daysUntil, productIcon, shortName, todayYmd, urgency } from '@/warranty';

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
export function WarrantyRow({ warranty: w, to, style }: { warranty: Warranty; to?: Href; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const today = todayYmd();
  const days = daysUntil(w.end_date, today);
  // Only what needs action gets colour; the rest stays quiet so the eye goes to it.
  const level = urgency(days);
  const tone = level === 'soon' || level === 'warning' ? { color: colors[level].fg, fontWeight: '700' as const } : { color: colors.muted };
  const product = displayName(t, w);

  return (
    <Pressable style={[styles.row, style]} onPress={() => router.push(to ?? `/warranty/${w.id}`)} accessibilityRole="button">
      {/* Photo if there is one, else an icon for the kind of product: rows are easier to tell apart. */}
      {w.photo_path && documentUriOrNull(w.photo_path) ? (
        <Image source={{ uri: documentUriOrNull(w.photo_path)! }} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.icon} importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons name={productIcon(w.product_name, w.category) as keyof typeof MaterialCommunityIcons.glyphMap} size={26} color={colors.primary} />
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {product}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={tone}>{daysLabel(t, days)}</Text> · {w.store_name}
          {w.coverage ? ` · ${t(`coverage.${w.coverage}`)}` : ''}
        </Text>
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
  thumb: { width: 44, height: 44, borderRadius: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  meta: { fontSize: 15, color: colors.muted },
});
