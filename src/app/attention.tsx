import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDate, WarrantyRow } from '@/components/WarrantyRow';
import { ListPage } from '@/components/Page';
import { Button, Group, SectionHeader } from '@/components/ui';
import { getDb } from '@/db/client';
import { answerReturn, deleteWarranty, listReturnPrompts, listWarranties, type ReturnPrompt, type Warranty } from '@/db/repo.ts';
import { deleteDocuments } from '@/documents';
import { colors, RADIUS, TYPE } from '@/theme';

// "Needs your attention" (section 9): return/refund questions first (section 11), then incomplete items.
export default function Attention() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<Warranty[]>([]);
  const [returns, setReturns] = useState<ReturnPrompt[]>([]);
  const reload = useCallback(() => {
    void getDb().then(async (db) => {
      setReturns(await listReturnPrompts(db));
      setItems((await listWarranties(db, 'needs_input')).sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)));
    });
  }, []);
  useFocusEffect(reload);

  // Nothing is deleted without an answer (section 11).
  async function answer(p: ReturnPrompt, remove: boolean) {
    const db = await getDb();
    if (remove) deleteDocuments(await deleteWarranty(db, p.warranty_id));
    await answerReturn(db, p.id, remove ? 'deleted' : 'kept');
    reload();
  }

  const header = (
    <>
      {returns.map((p) => (
        <View key={p.id}>
          <SectionHeader title={t('returns.title')} />
          <Group style={styles.card}>
            <Text style={styles.cardBody}>
              {t('returns.body', { store: p.store_name, date: formatDate(p.received_at.slice(0, 10), i18n.language), product: p.product_name ?? t('warranty.unknownProduct') })}
            </Text>
            <View style={styles.actions}>
              <Button kind="destructive" title={t('returns.delete')} onPress={() => answer(p, true)} style={styles.action} />
              <Button kind="glass" title={t('returns.keep')} onPress={() => answer(p, false)} style={styles.action} />
            </View>
          </Group>
        </View>
      ))}
      {items.length > 0 && <View style={returns.length ? styles.gap : styles.top} />}
    </>
  );

  return (
    <ListPage
      title={t('attention.title')}
      header={header}
      data={items}
      keyExtractor={(w) => String(w.id)}
      renderItem={({ item, index }) => (
        <WarrantyRow
          warranty={item}
          separator={index > 0}
          style={[styles.row, index === 0 && styles.first, index === items.length - 1 && styles.last]}
          to={{ pathname: '/warranty/edit', params: { id: String(item.id) } }}
        />
      )}
      ListEmptyComponent={returns.length ? undefined : <Text style={styles.empty}>{t('attention.empty')}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  empty: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', marginTop: 48 },
  card: { padding: 16, gap: 12 },
  cardBody: { ...TYPE.body, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1, flexBasis: 120 },
  gap: { height: 28 },
  top: { height: 20 },
  row: { backgroundColor: colors.card },
  first: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  last: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
});
