import { showAlert } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Text, View } from '@/components/themeMotion';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { displayName, formatDate, WarrantyRow } from '@/components/WarrantyRow';
import { ListPage } from '@/components/Page';
import { Button, GlassButton, Group, SectionHeader } from '@/components/ui';
import { getDb } from '@/db/client';
import { answerReturn, deleteWarranty, listReturnPrompts, type ReturnPrompt, type Warranty } from '@/db/repo.ts';
import { dismissedMissingDetails, dismissMissingDetails, missingDetails } from '@/db/productTools';
import { deleteDocuments } from '@/documents';
import { colors, RADIUS, TYPE, themed } from '@/theme';

// "Needs your attention" (section 9): return/refund questions first (section 11), then incomplete items.
export default function Attention() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<Warranty[]>([]);
  const [dismissed, setDismissed] = useState<Warranty[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [returns, setReturns] = useState<ReturnPrompt[]>([]);
  const reload = useCallback(() => {
    void getDb().then(async (db) => {
      setReturns(await listReturnPrompts(db));
      setDismissed(await dismissedMissingDetails(db));
      setItems((await missingDetails(db)).sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)));
    }).catch(e => showAlert(String(e)));
  }, []);
  useFocusEffect(reload);

  // Nothing is deleted without an answer (section 11).
  async function answer(p: ReturnPrompt, remove: boolean) {
    const db = await getDb();
    if (remove) deleteDocuments(await deleteWarranty(db, p.warranty_id));
    await answerReturn(db, p.id, remove ? 'deleted' : 'kept');
    reload();
  }

  const visible = showDismissed ? dismissed : items;
  const header = (
    <>
      {(dismissed.length > 0 || showDismissed) && <View style={styles.toggle}>
        <Button kind="glass" title={t(showDismissed ? 'attention.showActive' : 'attention.showDismissed', { count: dismissed.length })} onPress={() => setShowDismissed(value => !value)} />
      </View>}
      {!showDismissed && returns.map((p) => (
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
      lead={t('attention.lead')}
      header={header}
      data={visible}
      keyExtractor={(w) => String(w.id)}
      renderItem={({ item, index }) => (
        <View style={[styles.row, styles.item, index === 0 && styles.first, index === visible.length - 1 && styles.last]}>
          <WarrantyRow warranty={item} separator={index > 0} style={styles.warranty}
            to={{ pathname: '/warranty/[id]', params: { id: String(item.id) } }} />
          <View style={styles.dismiss}>
            <GlassButton icon={showDismissed ? "arrow-undo-outline" : "close"} label={t(showDismissed ? 'attention.restoreProduct' : 'attention.dismissProduct', { product: displayName(t, item) })}
              onPress={() => void getDb().then(db => dismissMissingDetails(db, item.id, !showDismissed)).then(reload).catch(e => showAlert(String(e)))} />
          </View>
        </View>
      )}
      ListEmptyComponent={!showDismissed && returns.length ? undefined : <EmptyState message={t(showDismissed ? 'attention.emptyDismissed' : 'attention.empty')} icon="checkmark-circle-outline" />}
    />
  );
}

const useStyles = themed(() => StyleSheet.create({
  card: { padding: 16, gap: 12 },
  cardBody: { ...TYPE.body, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1, flexBasis: 120 },
  gap: { height: 28 },
  top: { height: 20 },
  toggle: { marginTop: 16, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  warranty: { flex: 1, minWidth: 0 }, dismiss: { paddingRight: 12 },
  row: { backgroundColor: colors.card },
  first: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  last: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
}));
