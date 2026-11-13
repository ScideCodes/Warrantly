import { Text, View } from '@/components/themeMotion';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ListPage } from '@/components/Page';
import { displayName, formatDate } from '@/components/WarrantyRow';
import { Button, Group } from '@/components/ui';
import { showAlert } from '@/components/Dialog';
import { getDb } from '@/db/client';
import { dismissDuplicate, dismissedPairs, mergeWarranties } from '@/db/features.ts';
import { listArchived, listAttachments, listWarranties, type Warranty } from '@/db/repo.ts';
import { deleteDocuments } from '@/documents';
import { duplicatePairs, type DuplicatePair } from '@/duplicates';
import { colors, TYPE, themed } from '@/theme';

// Possible duplicates (shortlist 10): each pair with the reasons it was suggested. "Keep this one" merges
// the other into it (documents, notes, claims and reminders move over); "Not the same" never asks again.
export default function Duplicates() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const [pairs, setPairs] = useState<(DuplicatePair<Warranty> & { docs: [number, number] })[]>([]);
  const reload = useCallback(() => {
    void getDb().then(async (db) => {
      const list = [...(await listWarranties(db, 'complete')), ...(await listWarranties(db, 'needs_input')), ...(await listArchived(db))];
      const found = duplicatePairs(list, await dismissedPairs(db));
      setPairs(await Promise.all(found.map(async (p) => ({ ...p, docs: [(await listAttachments(db, p.a.id)).length, (await listAttachments(db, p.b.id)).length] as [number, number] }))));
    });
  }, []);
  useFocusEffect(reload);

  function keep(keepW: Warranty, drop: Warranty) {
    showAlert(t('dups.mergeTitle'), t('dups.mergeBody', { keep: displayName(t, keepW), drop: displayName(t, drop) }), [
      { text: t('detail.cancel'), style: 'cancel' },
      {
        text: t('dups.merge'), onPress: () => void (async () => {
          try {
            deleteDocuments(await mergeWarranties(await getDb(), keepW.id, drop.id));
          } catch (e) {
            showAlert(t('dups.mergeFailed'), e instanceof Error ? e.message : String(e));
          }
          reload();
        })(),
      },
    ]);
  }
  async function notSame(a: Warranty, b: Warranty) {
    await dismissDuplicate(await getDb(), a.id, b.id);
    reload();
  }

  const side = (w: Warranty, docs: number, other: Warranty) => (
    <View style={styles.side}>
      <Text style={styles.name} numberOfLines={2}>{displayName(t, w)}</Text>
      <Text style={styles.meta}>{w.store_name}</Text>
      <Text style={styles.meta}>{formatDate(w.purchase_date, i18n.language)}</Text>
      {w.order_number ? <Text style={styles.meta} numberOfLines={1}>{t('dups.order', { value: w.order_number })}</Text> : null}
      <Text style={styles.meta}>{t('dups.docs', { count: docs })}</Text>
      <Button kind="glass" title={t('dups.keepThis')} onPress={() => keep(w, other)} accessibilityLabel={`${t('dups.keepThis')}: ${displayName(t, w)}`} />
    </View>
  );

  return (
    <ListPage
      title={t('dups.title')}
      lead={t('dups.lead')}
      header={<View style={styles.gap} />}
      data={pairs}
      keyExtractor={(p) => `${p.a.id}:${p.b.id}`}
      ListEmptyComponent={<Text style={styles.empty}>{t('dups.empty')}</Text>}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      renderItem={({ item: p }) => (
        <Group style={styles.card}>
          <Text style={styles.why}>{t('dups.why', { reasons: p.reasons.map((r) => t(`dups.reason_${r}`)).join(', ') })}</Text>
          <View style={styles.pair}>
            {side(p.a, p.docs[0], p.b)}
            {side(p.b, p.docs[1], p.a)}
          </View>
          <Button kind="glass" title={t('dups.notSame')} onPress={() => void notSame(p.a, p.b)} />
        </Group>
      )}
    />
  );
}

const useStyles = themed(() => StyleSheet.create({
  gap: { height: 16 },
  empty: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', marginTop: 32 },
  card: { padding: 16, gap: 12 },
  why: { ...TYPE.sub, color: colors.ink2 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  side: { flex: 1, minWidth: 140, gap: 4 },
  name: { ...TYPE.body, fontWeight: '600', color: colors.ink },
  meta: { ...TYPE.foot, color: colors.ink2 },
}));
