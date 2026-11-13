import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/components/WarrantyRow';
import { ListPage } from '@/components/Page';
import { Button, Row } from '@/components/ui';
import { getDb } from '@/db/client';
import { listIgnored, restoreIgnored, type IgnoredRow } from '@/db/repo.ts';
import { colors, RADIUS, TYPE, themed } from '@/theme';

// Ignored mails (section 8): hidden from the lists, but reviewable and restorable.
export default function Ignored() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<IgnoredRow[]>([]);
  const reload = useCallback(() => {
    void getDb().then(listIgnored).then(setRows);
  }, []);
  useFocusEffect(reload);

  async function restore(id: number) {
    await restoreIgnored(await getDb(), id); // goes to "Needs your attention" to be completed
    reload();
  }

  return (
    <ListPage
      title={t('ignored.title')}
      lead={t('ignored.hint')}
      header={<View style={styles.gap} />}
      data={rows}
      keyExtractor={(r) => String(r.id)}
      ListEmptyComponent={<Text style={styles.empty}>{t('ignored.empty')}</Text>}
      renderItem={({ item, index }) => (
        <Row separator={index > 0} style={[styles.card, index === 0 && styles.first, index === rows.length - 1 && styles.last]}>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={2}>
              {item.subject ?? item.product_name ?? item.store_name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.sender ?? item.store_name} · {formatDate(item.purchase_date, i18n.language)}
            </Text>
          </View>
          <Button kind="glass" title={t('ignored.restore')} onPress={() => restore(item.id)} accessibilityLabel={`${t('ignored.restore')}: ${item.subject ?? item.store_name}`} />
        </Row>
      )}
    />
  );
}

const useStyles = themed(() => StyleSheet.create({
  gap: { height: 20 },
  empty: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', marginTop: 32 },
  card: { backgroundColor: colors.card, paddingVertical: 8 },
  first: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  last: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  text: { flex: 1 },
  title: { ...TYPE.body, color: colors.ink },
  meta: { ...TYPE.foot, color: colors.ink2 },
}));
