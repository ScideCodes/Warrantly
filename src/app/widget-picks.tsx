import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from '@/components/themeMotion';
import AppIcon from '@/components/Icon';
import { ListPage } from '@/components/Page';
import { Input, Row } from '@/components/ui';
import { displayName, formatDate } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listWarranties, type Warranty } from '@/db/repo';
import { getWidgetPicks, setWidgetPicks } from '@/settings';
import { updateWidget } from '@/widget';
import { plain, todayYmd } from '@/warranty';
import { colors, RADIUS, TYPE, themed } from '@/theme';

// Settings > Widget shows > Chosen: the warranties the home-screen widget lists. Each tap saves and redraws it.
export default function WidgetPicks() {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const [items, setItems] = useState<Warranty[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState(() => new Set(getWidgetPicks()));
  const [query, setQuery] = useState('');
  useFocusEffect(useCallback(() => {
    void getDb().then(async (db) => {
      const today = todayYmd();
      setItems((await listWarranties(db, 'complete')).filter((w) => w.end_date >= today).sort((a, b) => a.end_date.localeCompare(b.end_date)));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []));

  function toggle(id: number) {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
    setWidgetPicks([...next]);
    void getDb().then(updateWidget).catch(() => {});
  }

  const visible = items.filter((w) => plain(`${w.product_name} ${w.store_name}`).includes(plain(query.trim())));
  return (
    <ListPage
      title={t('widgetPicks.title')}
      lead={t('widgetPicks.lead')}
      header={items.length > 6 ? <Input value={query} onChangeText={setQuery} placeholder={t('home.search')} accessibilityLabel={t('home.search')} style={styles.search} /> : null}
      data={visible}
      keyExtractor={(w) => String(w.id)}
      renderItem={({ item: w, index: i }) => {
        const on = picked.has(w.id);
        return (
          <Row separator={i > 0} style={[styles.row, i === 0 && styles.first, i === visible.length - 1 && styles.last]}
            accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(w.id)}>
            <AppIcon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.tint : colors.ink2} />
            <View style={styles.flex}>
              <Text style={styles.text} numberOfLines={1}>{displayName(t, w)}</Text>
              <Text style={styles.hint} numberOfLines={1}>{`${w.store_name} · ${t('warranty.endsOn', { date: formatDate(w.end_date, i18n.language) })}`}</Text>
            </View>
          </Row>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>{t(loaded ? 'widgetPicks.empty' : 'form.loading')}</Text>}
    />
  );
}

const useStyles = themed(() => StyleSheet.create({
  search: { marginBottom: 12, backgroundColor: colors.card }, // on the page, like the home search
  row: { backgroundColor: colors.card },
  first: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  last: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  flex: { flex: 1, gap: 2 },
  text: { ...TYPE.body, color: colors.ink },
  hint: { ...TYPE.foot, color: colors.ink2 },
  empty: { ...TYPE.body, color: colors.ink2, padding: 16 },
}));
