import { Text, View } from '@/components/themeMotion';
import { router, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ProductIcon } from '@/components/Icon';
import type { Warranty } from '@/db/repo.ts';
import { useProductPhoto } from '@/components/useProductPhoto';
import { colors, TONE, TYPE, themed } from '@/theme';
import { Row, TILE } from '@/components/ui';
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

// One row for a warranty everywhere (home, attention list, other covers on the detail screen), laid out like
// the reference's hardware cell (`.cell`, ios.css line 276): a 29dp tile, the name (up to two lines) with a
// small badge beside it that says how long is left, then the store and end date on one line, and a chevron.
// Colour only backs up what the badge text says. `to` overrides where a tap goes (the attention list opens the
// resolve form directly).
export function WarrantyRow({ warranty: w, to, style, separator }: { warranty: Warranty; to?: Href; style?: StyleProp<ViewStyle>; separator?: boolean }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const today = todayYmd();
  const days = daysUntil(w.end_date, today);
  const level = urgency(days);
  const tone = TONE[level];
  const product = displayName(t, w);
  const left = daysLabel(t, days);
  // No-break spaces: the end date wraps as a whole, never as "Ends Dec" / "17, 2027".
  const ends = t(days < 0 ? 'warranty.endedOn' : 'warranty.endsOn', { date: formatDate(w.end_date, i18n.language) }).replace(/ /g, ' ');
  const store = w.coverage ? `${w.store_name} · ${t(`coverage.${w.coverage}`)}` : w.store_name;
  // The user's photo, else a picture found for the current name; the category icon when neither can be shown.
  const photo = useProductPhoto(w);

  return (
    <Row
      onPress={() => router.push(to ?? `/warranty/${w.id}`)}
      separator={separator}
      iconInset
      chevron
      style={[styles.row, style]} // TalkBack reads the texts inside in order: name, store, time left, end date
    >
      {photo ? (
        <Image source={{ uri: photo.uri }} onError={photo.onError} resizeMode="contain" style={[styles.tile, { backgroundColor: colors.card2 }]} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.tile, { backgroundColor: CATEGORY_TILE[w.category ?? ''] ?? TILE.blue }]} importantForAccessibility="no-hide-descendants">
          <ProductIcon name={productIcon(w.product_name, w.category) as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color="#fff" />
        </View>
      )}
      <View style={styles.text}>
        {/* The name and the days-left badge share a line; the badge drops below only when the name would get
            narrower than 55 % (large text, small phones). */}
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={2}>
            {product}
          </Text>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }, (level === 'ok' || level === 'expired') && styles.quietBadge]}>{left}</Text>
          </View>
        </View>
        {/* Store and end date share a line; a long store is cut to one line and the date moves below it, so
            the date is never the part that gets cut. */}
        <View style={styles.metaRow}>
          {!!store && (
            <Text style={[styles.meta, styles.store]} numberOfLines={1}>
              {`${store} ·`}
            </Text>
          )}
          <Text style={styles.meta}>{ends}</Text>
        </View>
      </View>
    </Row>
  );
}

// Tile colours per category, from the reference's tile palette (which colour goes with which category is Warrantly's).
const CATEGORY_TILE: Record<string, string> = {
  electronics: TILE.blue,
  computers: TILE.indigo,
  phones: TILE.green,
  appliances: TILE.orange,
  home: TILE.teal,
  tools: TILE.grey,
  other: TILE.cyan,
};

const useStyles = themed(() => StyleSheet.create({
  row: { gap: 12, paddingVertical: 9 },
  tile: { width: 29, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  text: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 8, rowGap: 3 },
  title: { ...TYPE.body, color: colors.ink, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: '55%' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 4 },
  meta: { ...TYPE.foot, color: colors.ink2 },
  store: { flexShrink: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginTop: 1 },
  badgeText: { ...TYPE.foot, fontWeight: '600' },
  quietBadge: { fontWeight: '400' },
}));
