import { useCallback, useState } from 'react';
import { Stack, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDate, WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { answerReturn, deleteWarranty, listReturnPrompts, listWarranties, type ReturnPrompt, type Warranty } from '@/db/repo.ts';
import { deleteDocuments } from '@/documents';
import { colors } from '@/theme';

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

  // Nothing is deleted without the user's answer (section 11).
  async function answer(p: ReturnPrompt, remove: boolean) {
    const db = await getDb();
    if (remove) deleteDocuments(await deleteWarranty(db, p.warranty_id));
    await answerReturn(db, p.id, remove ? 'deleted' : 'kept');
    reload();
  }

  const header = returns.length ? (
    <View style={styles.cards}>
      {returns.map((p) => (
        <View key={p.id} style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            {t('returns.title')}
          </Text>
          <Text style={styles.cardBody}>
            {t('returns.body', { store: p.store_name, date: formatDate(p.received_at.slice(0, 10), i18n.language), product: p.product_name ?? t('warranty.unknownProduct') })}
          </Text>
          <View style={styles.actions}>
            <Pressable style={[styles.action, styles.delete]} onPress={() => answer(p, true)} accessibilityRole="button">
              <Text style={styles.deleteText}>{t('returns.delete')}</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => answer(p, false)} accessibilityRole="button">
              <Text style={styles.keepText}>{t('returns.keep')}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  ) : undefined;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('attention.title') }} />
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(w) => String(w.id)}
        renderItem={({ item }) => <WarrantyRow warranty={item} to={{ pathname: '/warranty/edit', params: { id: String(item.id) } }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={returns.length ? undefined : <Text style={styles.empty}>{t('attention.empty')}</Text>}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 24, paddingBottom: 24 },
  empty: { fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 48 },
  cards: { gap: 12, paddingTop: 16, paddingBottom: 8 },
  card: { borderRadius: 8, padding: 16, gap: 8, backgroundColor: colors.warning.bg },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.warning.fg },
  cardBody: { fontSize: 15, lineHeight: 22, color: colors.text },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  delete: { borderColor: colors.soon.fg },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.soon.fg },
  keepText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
