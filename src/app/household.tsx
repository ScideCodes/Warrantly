import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from '@/components/themeMotion';
import AppIcon from '@/components/Icon';
import { ListPage } from '@/components/Page';
import { Button, Group, Input, Row, SectionHeader, Switch } from '@/components/ui';
import { showAlert } from '@/components/Dialog';
import { displayName } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listWarranties, type Warranty } from '@/db/repo';
import { shareHousehold, importSharedFile } from '@/dataTools';
import { rescheduleReminders } from '@/reminders';
import { plain } from '@/warranty';
import { colors, TYPE, RADIUS, themed } from '@/theme';

export default function Household() {
  const { t } = useTranslation();
  const styles = useStyles();
  const [items, setItems] = useState<Warranty[]>([]), [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(new Set<number>()), [privateDetails, setPrivate] = useState(false), [busy, setBusy] = useState(false), [query, setQuery] = useState('');
  const reload = useCallback(() => { void getDb().then(async db => {
    setItems([...await listWarranties(db, 'complete'), ...await listWarranties(db, 'needs_input')]); setLoaded(true);
  }).catch(e => { setLoaded(true); showAlert(t('household.failed'), String(e)); }); }, [t]);
  useFocusEffect(reload);
  async function send() {
    if (busy || !selected.size) return;
    setBusy(true);
    try { await shareHousehold(await getDb(), [...selected], privateDetails); }
    catch (e) { showAlert(t('household.failed'), String(e)); }
    finally { setBusy(false); }
  }
  async function receive() {
    if (busy) return;
    setBusy(true);
    try { const db = await getDb(); const added = await importSharedFile(db); if (added !== null) { await rescheduleReminders(db); reload(); showAlert(t('data.imported', { count: added })); } }
    catch (e) { showAlert(t('household.failed'), String(e)); }
    finally { setBusy(false); }
  }
  const visible = items.filter(w => plain(`${w.product_name} ${w.store_name}`).includes(plain(query.trim())));
  return <ListPage title={t('household.title')} lead={t('household.lead')}
    header={<>
      <Button kind="glass" title={t('household.receive')} icon="download-outline" onPress={() => void receive()} disabled={busy} />
      <SectionHeader title={t('household.choose')} />
      <Input value={query} onChangeText={setQuery} placeholder={t('home.search')} accessibilityLabel={t('home.search')} style={styles.search} />
    </>}
    data={visible} keyExtractor={w => String(w.id)}
    renderItem={({ item: w, index: i }) => <Row separator={i > 0} style={[styles.row, i === 0 && styles.first, i === visible.length - 1 && styles.last]} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(w.id) }} onPress={() => setSelected(s => { const next = new Set(s); if (!next.delete(w.id)) next.add(w.id); return next; })}>
      <AppIcon name={selected.has(w.id) ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected.has(w.id) ? colors.tint : colors.ink2} />
      <View style={styles.flex}><Text style={styles.text}>{displayName(t, w)}</Text><Text style={styles.hint}>{w.store_name}</Text></View>
    </Row>}
    ListEmptyComponent={<Text style={styles.empty}>{t(loaded ? 'household.empty' : 'form.loading')}</Text>}
    ListFooterComponent={<>
      <SectionHeader title={t('household.include')} />
      <Group><Row><Text style={styles.text}>{t('household.private')}</Text><Switch value={privateDetails} onValueChange={setPrivate} disabled={busy} accessibilityLabel={t('household.private')} /></Row></Group>
      <Text style={styles.note}>{t('household.privacy')}</Text>
      <View style={styles.actions}><Button title={t('household.send', { count: selected.size })} icon="share-outline" onPress={() => void send()} disabled={busy || !selected.size} busy={busy} /></View>
    </>}
  />;
}
const useStyles = themed(() => StyleSheet.create({
  search: { marginBottom: 12 }, row: { backgroundColor: colors.card }, first: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS }, last: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS }, flex: { flex: 1, gap: 4 }, text: { ...TYPE.body, color: colors.ink, flex: 1 }, hint: { ...TYPE.foot, color: colors.ink2 },
  note: { ...TYPE.foot, color: colors.ink2, paddingHorizontal: 4, marginTop: 12 }, empty: { ...TYPE.body, color: colors.ink2, padding: 16 }, actions: { marginTop: 20 },
}));
