import { EmptyState } from '@/components/EmptyState';
import { Text, View } from '@/components/themeMotion';
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppIcon from '@/components/Icon';
import { ListPage } from '@/components/Page';
import { SheetBody, SheetFrame } from '@/components/Sheet';
import { Button, Input, Row, Segmented } from '@/components/ui';
import { showAlert } from '@/components/Dialog';
import { getDb } from '@/db/client';
import { COLLECTION_KINDS, createCollection, deleteCollection, listCollections, renameCollection, setMembership, type Collection, type CollectionKind } from '@/db/features.ts';
import { colors, RADIUS, TYPE, themed } from '@/theme';

type Editing = { id: number | null; name: string; kind: CollectionKind | 'none' };

// Collections (shortlist 7): the user's own groups (a room, a person, a purpose). An item can be in several;
// deleting a collection never deletes its items. `add` (from the home bulk bar) puts those items in a new one.
export default function Collections() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const [list, setList] = useState<Collection[]>([]);
  const [editing, setEditing] = useState<Editing | null>(add ? { id: null, name: '', kind: 'none' } : null);
  const reload = useCallback(() => void getDb().then(listCollections).then(setList), []);
  useFocusEffect(reload);

  async function save() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    const db = await getDb();
    const kind = editing.kind === 'none' ? null : editing.kind;
    if (editing.id === null) {
      const id = await createCollection(db, name, kind);
      const ids = (add ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) await setMembership(db, id, ids, true);
    } else await renameCollection(db, editing.id, name, kind);
    setEditing(null);
    reload();
  }
  function remove(c: Collection) {
    showAlert(t('collections.deleteTitle', { name: c.name }), t('collections.deleteBody'), [
      { text: t('detail.cancel'), style: 'cancel' },
      { text: t('collections.delete'), style: 'destructive', onPress: () => void getDb().then((db) => deleteCollection(db, c.id)).then(() => { setEditing(null); reload(); }) },
    ]);
  }

  return (
    <>
      <ListPage
        title={t('collections.title')}
        lead={t('collections.lead')}
        header={<View style={styles.head}><Button title={t('collections.new')} icon="add" onPress={() => setEditing({ id: null, name: '', kind: 'none' })} /></View>}
        data={list}
        keyExtractor={(c) => String(c.id)}
        ListEmptyComponent={<EmptyState message={t('collections.empty')} icon="albums-outline" />}
        renderItem={({ item, index }) => (
          <Row separator={index > 0} style={[styles.card, index === 0 && styles.first, index === list.length - 1 && styles.last]} iconInset chevron
            onPress={() => setEditing({ id: item.id, name: item.name, kind: item.kind ?? 'none' })}>
            <View style={styles.glyph}><AppIcon name={item.kind === 'room' ? 'home-outline' : item.kind === 'owner' ? 'person-outline' : item.kind === 'purpose' ? 'briefcase-outline' : 'albums-outline'} size={22} color={colors.tint} /></View>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.count}>{item.count}</Text>
          </Row>
        )}
      />
      <SheetFrame open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? t('collections.edit') : t('collections.new')}>
        <SheetBody>
          {editing && (
            <View style={styles.form}>
              <Input inSheet value={editing.name} onChangeText={(name) => setEditing({ ...editing, name })} placeholder={t('collections.namePlaceholder')} accessibilityLabel={t('collections.name')} autoFocus maxLength={60} />
              <Segmented large
                options={[{ key: 'none' as const, label: t('collections.kind_none') }, ...COLLECTION_KINDS.map((k) => ({ key: k, label: t(`collections.kind_${k}`) }))]}
                value={editing.kind}
                onChange={(kind) => setEditing({ ...editing, kind })}
              />
              <Button title={t('collections.save')} onPress={() => void save()} disabled={!editing.name.trim()} />
              {editing.id !== null && <Button kind="glass" title={t('collections.delete')} onPress={() => remove(list.find((c) => c.id === editing.id)!)} />}
            </View>
          )}
        </SheetBody>
      </SheetFrame>
    </>
  );
}

const useStyles = themed(() => StyleSheet.create({
  head: { marginTop: 12, marginBottom: 20 },
  card: { backgroundColor: colors.card },
  first: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  last: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  glyph: { width: 29, alignItems: 'center', flexShrink: 0 },
  name: { flex: 1, ...TYPE.body, color: colors.ink },
  count: { ...TYPE.body, fontVariant: ['tabular-nums'], color: colors.ink2 },
  form: { gap: 12, paddingBottom: 8 },
}));
