import { EmptyState } from '@/components/EmptyState';
import { Pressable, Text, TextInput, View } from '@/components/themeMotion';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppIcon from '@/components/Icon';
import { DocThumb } from '@/components/DocThumb';
import { ListPage } from '@/components/Page';
import { Sheet } from '@/components/Sheet';
import { Button, Group, Row } from '@/components/ui';
import { showAlert } from '@/components/Dialog';
import { getDb } from '@/db/client';
import { listAllDocuments, retryFailedIndex, type DocumentRow } from '@/db/features.ts';
import { DOC_LABELS, type DocLabel } from '@/db/repo.ts';
import { cancelIndex, refreshIndexCounts, runIndex, useIndexState } from '@/docIndex';
import { openViewer } from '@/docOpen';
import { documentExists, openDocument, saveDocument } from '@/documents';
import { colors, CONTROL_H, FIELD_RADIUS, RADIUS, TYPE, themed } from '@/theme';
import { plain } from '@/warranty';

// Documents (shortlist 19): every stored receipt, card and report in one place, searchable by name, product,
// label and (once read) the text inside. Open, save or share each; the reading progress is shown with a way to
// stop it or to try again files that could not be read.
export default function Documents() {
  const styles = useStyles();
  const { t } = useTranslation();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState<DocLabel | 'all'>('all');
  const [chosen, setChosen] = useState<DocumentRow | null>(null);
  const index = useIndexState();
  const q = useDeferredValue(query);
  const reload = useCallback(() => {
    void getDb().then(listAllDocuments).then(setDocs);
    void refreshIndexCounts();
  }, []);
  useFocusEffect(reload);

  const words = useMemo(() => plain(q).split(/\s+/).filter(Boolean), [q]);
  const shown = useMemo(() => docs.filter((d) => (label === 'all' || d.label === label)
    && words.every((w) => plain(`${d.filename} ${d.product_name ?? ''} ${d.store_name} ${t(`docLabel.${d.label}`)}`).includes(w) || (d.text ?? '').includes(w))), [docs, label, words, t]);
  const left = index.total - index.done - index.failed;

  async function readAll() {
    await runIndex(1000);
    reload();
  }
  async function retry() {
    await retryFailedIndex(await getDb());
    await readAll();
  }
  const name = (d: DocumentRow) => d.product_name ?? d.store_name;

  const header = (
    <View style={styles.header}>
      <View style={styles.search}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('docs.search')}
          placeholderTextColor={colors.ink2}
          accessibilityLabel={t('docs.search')}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(['all', ...DOC_LABELS] as const).map((l) => (
          <Pressable key={l} onPress={() => setLabel(l)} style={[styles.chip, label === l && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: label === l }}>
            <Text style={[styles.chipText, label === l && styles.chipTextOn]}>{l === 'all' ? t('docs.all') : t(`docLabel.${l}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {index.total > 0 && (
        <Group>
          <Row iconInset accessibilityRole="text">
            <AppIcon name={index.running ? 'hourglass-outline' : left > 0 ? 'search-outline' : 'checkmark-circle-outline'} size={22} color={left > 0 || index.running ? colors.tint : colors.ok} />
            <Text style={styles.indexText} accessibilityLiveRegion="polite">
              {index.running ? t('docs.reading', { done: index.done, total: index.total }) : left > 0 ? t('docs.unread', { count: left }) : t('docs.allRead')}
            </Text>
          </Row>
          {(index.running || left > 0 || index.failed > 0) && (
            <View style={styles.indexActions}>
              {index.running
                ? <Button kind="glass" title={t('docs.stop')} onPress={cancelIndex} />
                : left > 0 ? <Button kind="glass" title={t('docs.readNow')} onPress={() => void readAll()} /> : null}
              {!index.running && index.failed > 0 && <Button kind="glass" title={t('docs.retryFailed', { count: index.failed })} onPress={() => void retry()} />}
            </View>
          )}
        </Group>
      )}
    </View>
  );

  return (
    <>
      <ListPage
        title={t('docs.title')}
        lead={t('docs.lead')}
        header={header}
        data={shown}
        keyExtractor={(d) => String(d.id)}
        ListEmptyComponent={<EmptyState message={docs.length ? t('home.noMatch') : t('docs.empty')} icon={docs.length ? 'search-outline' : 'document-text-outline'} />}
        renderItem={({ item, index: i }) => {
          const missing = !documentExists(item.local_path);
          return (
            <Row
              separator={i > 0}
              style={[styles.card, i === 0 && styles.first, i === shown.length - 1 && styles.last]}
              onPress={() => setChosen(item)}
              accessibilityLabel={`${name(item)}, ${t(`docLabel.${item.label}`)}, ${item.filename}${missing ? `, ${t('detail.fileMissing')}` : ''}`}
              chevron
            >
              <DocThumb localPath={item.local_path} size={36} />
              <View style={styles.text}>
                <Text style={styles.title} numberOfLines={1}>{name(item)}</Text>
                <Text style={[styles.meta, missing && styles.bad]} numberOfLines={1}>{missing ? t('docs.missingFix') : `${t(`docLabel.${item.label}`)} · ${item.filename}`}</Text>
              </View>
            </Row>
          );
        }}
      />
      <Sheet
        open={chosen !== null}
        onClose={() => setChosen(null)}
        title={chosen ? name(chosen) : ''}
        subtitle={chosen ? `${t(`docLabel.${chosen.label}`)} · ${chosen.filename}` : undefined}
        sections={chosen ? [{ options: documentExists(chosen.local_path) ? [
          { key: 'open', icon: 'eye-outline', label: t('docs.open'), onPress: () => openViewer(chosen, name(chosen)) },
          { key: 'save', icon: 'download-outline', label: t('detail.saveCopy'), onPress: () => void saveDocument(chosen.local_path, chosen.filename).then((saved) => { if (saved) showAlert(t('detail.saved')); }, (e) => showAlert(t('detail.saveFailed', { detail: e instanceof Error ? e.message : String(e) }))) },
          { key: 'share', icon: 'share-outline', label: t('docs.share'), onPress: () => void openDocument(chosen.local_path).catch((e) => showAlert(t('detail.shareFailed', { detail: e instanceof Error ? e.message : String(e) }))) },
          { key: 'item', icon: 'shield-checkmark-outline', label: t('docs.openWarranty'), onPress: () => router.push(`/warranty/${chosen.warranty_id}`) },
        ] : [
          { key: 'item', icon: 'shield-checkmark-outline', label: t('docs.openWarranty'), onPress: () => router.push(`/warranty/${chosen.warranty_id}`) },
          { key: 'restore', icon: 'cloud-download-outline', label: t('backup.restore'), onPress: () => router.push('/restore') },
        ] }] : []}
      />
    </>
  );
}

const useStyles = themed(() => StyleSheet.create({
  header: { gap: 12, marginTop: 12, marginBottom: 20 },
  search: { minHeight: CONTROL_H, borderRadius: FIELD_RADIUS, backgroundColor: colors.card, paddingHorizontal: 12, justifyContent: 'center' },
  searchInput: { minHeight: CONTROL_H, ...TYPE.body, color: colors.ink, paddingVertical: 9 },
  chips: { gap: 8 },
  chip: { minHeight: CONTROL_H, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.tintSoft },
  chipText: { ...TYPE.sub, color: colors.ink },
  chipTextOn: { color: colors.tintInk, fontWeight: '600' },
  indexText: { flex: 1, ...TYPE.body, color: colors.ink },
  indexActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  card: { backgroundColor: colors.card },
  first: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  last: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  text: { flex: 1, gap: 2 },
  title: { ...TYPE.body, color: colors.ink },
  meta: { ...TYPE.foot, color: colors.ink2 },
  bad: { color: colors.bad },
}));
