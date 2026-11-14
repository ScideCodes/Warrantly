import { memo } from 'react';
import { Text, View } from '@/components/themeMotion';
import AppIcon, { ProductIcon } from '@/components/Icon';
import { router, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { Image, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Warranty } from '@/db/repo.ts';
import { useProductPhoto } from '@/components/useProductPhoto';
import { colors, TONE, TYPE, themed, useRoom } from '@/theme';
import { Row, TILE } from '@/components/ui';
import type { Density } from '@/settings';
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

// Keep the existing public helper while sharing precision rules with the price editor.
export { formatMoney } from '@/money';

export function formatDate(ymd: string, language: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' });
}

// One row for a warranty everywhere (home, attention list, other covers on the detail screen), laid out like
// the reference's hardware cell (`.cell`, ios.css line 276): a 29dp tile, the name (up to two lines) with a
// small badge beside it that says how long is left, then the store and end date on one line, and a chevron.
// Colour only backs up what the badge text says. `to` overrides where a tap goes (the attention list opens the
// resolve form directly).
// Shortlist: `density` compact uses less padding and keeps store and date on one line (text size unchanged).
// `selecting` turns a tap into select/deselect (bulk actions), with a check circle before the tile.
// `onDocument` adds a document button (opens the only document, a picker, or a way to add one); the rest of
// the row still opens the details.
export const WarrantyRow = memo(function WarrantyRow({ warranty: w, to, style, separator, density = 'comfortable', selecting, selected, onToggle, onDocument, onLongPress }: {
  warranty: Warranty; to?: Href; style?: StyleProp<ViewStyle>; separator?: boolean; density?: Density;
  selecting?: boolean; selected?: boolean; onToggle?: (id: number) => void; onDocument?: (w: Warranty) => void; onLongPress?: (id: number) => void;
}) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const today = todayYmd();
  const days = daysUntil(w.end_date, today);
  const level = urgency(days);
  const tone = TONE[level];
  const product = displayName(t, w);
  const left = daysLabel(t, days);
  const counter = t(days === 0 ? 'warranty.counterToday' : days < 0 ? 'warranty.counterExpired' : 'warranty.counterDays', { count: Math.abs(days) });
  // No-break spaces: the end date wraps as a whole, never as "Ends Dec" / "17, 2027".
  const ends = t(days < 0 ? 'warranty.endedOn' : 'warranty.endsOn', { date: formatDate(w.end_date, i18n.language) }).replace(/ /g, ' ');
  const store = w.coverage ? `${w.store_name} · ${t(`coverage.${w.coverage}`)}` : w.store_name;
  // The person's own photo; the category icon when there is none or it cannot be shown.
  const photo = useProductPhoto(w);

  const stacked = !useRoom()(300);
  const compact = density === 'compact';
  const docs = w.doc_count ?? 0;
  return (
    <Row
      onPress={selecting ? () => onToggle?.(w.id) : () => router.push(to ?? `/warranty/${w.id}`)}
      // Keep the handler present after bulk mode starts: removing it while a finger is down makes
      // Pressability treat release as another tap and immediately toggle the selected item back off.
      onLongPress={onLongPress ? () => { if (!selecting) onLongPress(w.id); } : undefined}
      separator={separator}
      iconInset
      chevron={!selecting && !onDocument}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityLabel={`${product}, ${left}, ${store}, ${ends}`}
      accessibilityState={selecting ? { checked: !!selected } : undefined}
      selected={selecting && selected}
      style={[styles.row, compact && styles.rowCompact, style]} // TalkBack reads the texts inside in order: name, store, time left, end date
    >
      {selecting && (
        <View style={[styles.check, selected && styles.checkOn]} importantForAccessibility="no-hide-descendants">
          {selected && <AppIcon name="checkmark" size={15} color="#fff" />}
        </View>
      )}
      {photo ? (
        <Image source={{ uri: photo.uri }} onError={photo.onError} style={styles.tile} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.tile, { backgroundColor: CATEGORY_TILE[w.category ?? ''] ?? TILE.blue }]} importantForAccessibility="no-hide-descendants">
          <ProductIcon name={productIcon(w.product_name, w.category) as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color="#fff" />
        </View>
      )}
      <View style={styles.text}>
        {/* Compact, single-line counter; full wording remains available to accessibility readers. */}
        <View style={[styles.top, stacked && styles.topStack]}>
          <View style={[styles.nameLine, stacked && styles.nameLineStack]}>
          {!!w.favorite && (
            <View style={styles.pin} accessible accessibilityLabel={t('row.pinned')}>
              <AppIcon name="star" size={14} color={colors.warn} />
            </View>
          )}
          <Text style={styles.title} numberOfLines={2}>
            {product}
          </Text>
          </View>
          <View style={[styles.badge, stacked && styles.badgeStack, { backgroundColor: tone.bg }]} accessible accessibilityLabel={left}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}
              style={[styles.badgeText, { color: tone.fg }, (level === 'ok' || level === 'expired') && styles.quietBadge]}>{counter}</Text>
          </View>
        </View>
        {/* Store and end date share a line; a long store is cut to one line and the date moves below it, so
            the date is never the part that gets cut. */}
        <View style={[styles.metaRow, compact && styles.metaCompact]}>
          {!!store && (
            <Text style={[styles.meta, styles.store]} numberOfLines={1}>
              {`${store} ·`}
            </Text>
          )}
          <Text style={styles.meta} numberOfLines={compact ? 1 : undefined}>{ends}</Text>
        </View>
      </View>
      {onDocument && !selecting && (
        // 44dp target; the glyph says whether there is a document. Its label names the product.
        <Pressable
          onPress={() => onDocument(w)}
          style={({ pressed }) => [styles.docButton, pressed && styles.docPressed]}
          accessibilityRole="button"
          accessibilityLabel={docs ? t('row.openDocuments', { count: docs, product }) : t('row.addDocument', { product })}
          hitSlop={4}
        >
          <AppIcon name={docs ? 'document-text-outline' : 'document-attach-outline'} size={21} color={docs ? colors.tint : colors.ink2} />
          {docs > 1 && <Text style={styles.docCount}>{docs}</Text>}
        </Pressable>
      )}
    </Row>
  );
});

// Tile colours per category, from the reference's tile palette (which colour goes with which category is Warrantly's).
const CATEGORY_TILE: Record<string, string> = {
  electronics: TILE.blue,
  computers: TILE.indigo,
  phones: TILE.green,
  appliances: TILE.orange,
  home: TILE.teal,
  tools: TILE.grey,
  vehicles: TILE.purple,
  other: TILE.cyan,
};

const useStyles = themed(() => StyleSheet.create({
  row: { gap: 12, paddingVertical: 9 },
  rowCompact: { paddingVertical: 5, minHeight: 44 },
  pin: { paddingTop: 3 },
  metaCompact: { flexWrap: 'nowrap' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.ink2, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  checkOn: { backgroundColor: colors.tint, borderColor: colors.tint },
  docButton: { width: 44, height: 44, marginRight: -8, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  docPressed: { backgroundColor: colors.press },
  docCount: { ...TYPE.cap, color: colors.tint, position: 'absolute', right: 6, bottom: 6, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tile: { width: 29, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  top: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'flex-start', columnGap: 8 },
  topStack: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  nameLine: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 8 },
  nameLineStack: { flex: undefined },
  badgeStack: { alignSelf: 'flex-end', maxWidth: '100%' },
  title: { ...TYPE.body, color: colors.ink, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 4 },
  meta: { ...TYPE.foot, color: colors.ink2, fontVariant: ['tabular-nums'] },
  store: { flexShrink: 1 },
  badge: { flexShrink: 0, maxWidth: '65%', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginTop: 1 },
  badgeText: { fontVariant: ['tabular-nums'], ...TYPE.foot, fontWeight: '600' },
  quietBadge: { fontWeight: '400' },
}));
