import { EmptyState } from '@/components/EmptyState';
import { Text, View } from '@/components/themeMotion';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DocThumb } from '@/components/DocThumb';
import { ListPage } from '@/components/Page';
import { Sheet, type SheetSection } from '@/components/Sheet';
import { displayName, formatDate } from '@/components/WarrantyRow';
import { Row } from '@/components/ui';
import { showAlert } from '@/components/Dialog';
import { getDb } from '@/db/client';
import { assignInbox, discardInbox, listInbox, type InboxItem } from '@/db/features.ts';
import { DOC_LABELS, listWarranties, type DocLabel, type Warranty } from '@/db/repo.ts';
import { deleteDocuments } from '@/documents';
import { colors, RADIUS, TYPE, themed } from '@/theme';

type Step = { item: InboxItem; step: 'menu' } | { item: InboxItem; step: 'pick' } | { item: InboxItem; step: 'label'; warranty: Warranty };

// Document inbox (shortlist 16): files shared into the app wait here until they are made into a new
// warranty, attached to an existing one, or discarded. Nothing is lost if the app closes in between.
export default function Inbox() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [all, setAll] = useState<Warranty[]>([]);
  const [step, setStep] = useState<Step | null>(null);
  const reload = useCallback(() => {
    void getDb().then(async (db) => {
      setItems(await listInbox(db));
      setAll([...(await listWarranties(db, 'complete')), ...(await listWarranties(db, 'needs_input'))]);
    });
  }, []);
  useFocusEffect(reload);
  const next = (s: Step) => { setStep(null); setTimeout(() => setStep(s), 250); }; // one sheet closes, the next opens

  async function attach(item: InboxItem, w: Warranty, label: DocLabel) {
    await assignInbox(await getDb(), item.id, w.id, label);
    setStep(null);
    reload();
    showAlert(t('inbox.attached', { name: displayName(t, w) }));
  }
  function discard(item: InboxItem) {
    showAlert(t('inbox.discardTitle'), t('inbox.discardBody'), [
      { text: t('detail.cancel'), style: 'cancel' },
      {
        text: t('inbox.discard'), style: 'destructive', onPress: () => void (async () => {
          const gone = await discardInbox(await getDb(), item.id);
          if (gone) deleteDocuments([gone]);
          reload();
        })(),
      },
    ]);
  }

  const sections: SheetSection[] = !step ? [] : step.step === 'menu' ? [{ options: [
    { key: 'view', icon: 'eye-outline', label: t('docs.open'), onPress: () => router.push({ pathname: '/document', params: { path: step.item.local_path, title: step.item.filename, name: step.item.filename } }) },
    { key: 'new', icon: 'add-circle-outline', label: t('inbox.newWarranty'), onPress: () => router.push({ pathname: '/warranty/edit', params: { inbox: String(step.item.id) } }) },
    ...(all.length ? [{ key: 'attach', icon: 'attach-outline' as const, label: t('inbox.attachExisting'), onPress: () => next({ item: step.item, step: 'pick' }) }] : []),
    { key: 'discard', icon: 'trash-outline', label: t('inbox.discard'), destructive: true, onPress: () => discard(step.item) },
  ] }] : step.step === 'pick' ? [{ options: all.map((w) => ({ key: String(w.id), label: displayName(t, w), onPress: () => next({ item: step.item, step: 'label', warranty: w }) })) }]
    : [{ options: DOC_LABELS.map((l) => ({ key: l, label: t(`docLabel.${l}`), onPress: () => void attach(step.item, step.warranty, l) })) }];

  return (
    <>
      <ListPage
        title={t('inbox.title')}
        lead={t('inbox.lead')}
        header={<View style={styles.gap} />}
        data={items}
        keyExtractor={(r) => String(r.id)}
        ListEmptyComponent={<EmptyState message={t('inbox.empty')} icon="file-tray-outline" />}
        renderItem={({ item, index }) => (
          <Row separator={index > 0} style={[styles.card, index === 0 && styles.first, index === items.length - 1 && styles.last]} onPress={() => setStep({ item, step: 'menu' })} chevron
            accessibilityLabel={`${item.filename}, ${formatDate(item.received_at.slice(0, 10), i18n.language)}`}>
            <DocThumb localPath={item.local_path} size={36} />
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={2}>{item.filename}</Text>
              <Text style={styles.meta}>{t('inbox.received', { date: formatDate(item.received_at.slice(0, 10), i18n.language) })}</Text>
            </View>
          </Row>
        )}
      />
      <Sheet
        open={step !== null}
        onClose={() => setStep(null)}
        title={!step ? '' : step.step === 'menu' ? step.item.filename : step.step === 'pick' ? t('inbox.attachExisting') : t('inbox.whichLabel')}
        sections={sections}
      />
    </>
  );
}

const useStyles = themed(() => StyleSheet.create({
  gap: { height: 20 },
  card: { backgroundColor: colors.card },
  first: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  last: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  text: { flex: 1, gap: 2 },
  title: { ...TYPE.body, color: colors.ink },
  meta: { ...TYPE.foot, color: colors.ink2 },
}));
