import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from '@/components/themeMotion';
import { Page } from '@/components/Page';
import { Button, Group, Row, SectionHeader } from '@/components/ui';
import { SheetBody, SheetFrame } from '@/components/Sheet';
import { showAlert } from '@/components/Dialog';
import { useDatePicker } from '@/components/DatePicker';
import { displayName, formatDate } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { getWarranty, listWarranties, type Warranty } from '@/db/repo';
import { unlinkReplacements, linkReplacement, replacementHistory, setReturnDeadline } from '@/db/productTools';
import { rescheduleReminders } from '@/reminders';
import { returnDeadline, todayYmd } from '@/warranty';
import { colors, TYPE, themed } from '@/theme';

export default function ProductTools() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const { pickDate, datePicker } = useDatePicker();
  const [w, setW] = useState<Warranty | null>(null), [loaded, setLoaded] = useState(false);
  const [links, setLinks] = useState<{ original: Warranty | null; replacements: Warranty[] }>({ original: null, replacements: [] });
  const [choices, setChoices] = useState<Warranty[]>([]), [picker, setPicker] = useState(false), [busy, setBusy] = useState(false);
  const reload = useCallback(() => {
    void getDb().then(async db => {
      const [found, history] = await Promise.all([getWarranty(db, Number(id)), replacementHistory(db, Number(id))]);
      setW(found); setLinks(history); setLoaded(true);
    }).catch(e => { setLoaded(true); showAlert(t('productTools.failed'), String(e)); });
  }, [id, t]);
  useFocusEffect(reload);
  async function changeDate(date: string | null) {
    if (!w || busy) return;
    setBusy(true);
    try { const db = await getDb(); await setReturnDeadline(db, w.id, date); await rescheduleReminders(db); reload(); }
    catch (e) { showAlert(t('productTools.failed'), String(e)); }
    finally { setBusy(false); }
  }
  async function chooseReplacement() {
    try {
      const db = await getDb();
      const candidates = [...await listWarranties(db, 'complete'), ...await listWarranties(db, 'needs_input')];
      setChoices(candidates.filter(c => c.id !== w?.id && !c.replacement_of)); setPicker(true);
    } catch (e) { showAlert(t('productTools.failed'), String(e)); }
  }
  async function link(next: Warranty) {
    if (!w || busy) return;
    setBusy(true);
    try { await linkReplacement(await getDb(), w.id, next.id); setPicker(false); reload(); }
    catch { showAlert(t('productTools.failed'), t('productTools.cycle')); }
    finally { setBusy(false); }
  }
  function unlink() {
    if (!w || busy) return;
    showAlert(t('productTools.unlink'), t('productTools.unlinkHint'), [
      { text: t('detail.cancel'), style: 'cancel' },
      { text: t('productTools.unlink'), onPress: () => {
        setBusy(true);
        void getDb().then(db => unlinkReplacements(db, w.id)).then(reload).catch(e => showAlert(t('productTools.failed'), String(e))).finally(() => setBusy(false));
      } },
    ]);
  }
  const deadline = w && returnDeadline(w);
  const relatedRow = (item: Warranty, label: string) => <Row key={item.id} chevron onPress={() => router.push({ pathname: '/warranty/[id]', params: { id: String(item.id) } })}>
    <View style={styles.flex}><Text style={styles.hint}>{label}</Text><Text style={styles.text}>{displayName(t, item)}</Text></View>
  </Row>;
  return <>
    <Page title={t('productTools.title')} lead={w ? displayName(t, w) : undefined}>
      {!loaded ? <Text style={styles.hint}>{t('form.loading')}</Text> : !w ? <Text style={styles.hint}>{t('transfer.unavailable')}</Text> : <>
        <SectionHeader title={t('productTools.returnTitle')} first />
        <Group>
          <Row chevron disabled={busy} onPress={() => pickDate({ title: t('productTools.returnDate'), value: deadline || todayYmd(), minimum: w.purchase_date, onPick: date => void changeDate(date) })}>
            <View style={styles.flex}><Text style={styles.text}>{t('productTools.returnDate')}</Text><Text style={styles.hint}>{deadline ? formatDate(deadline, i18n.language) : t('productTools.noDeadline')}</Text></View>
          </Row>
          {deadline && <Row separator onPress={() => void changeDate('')} disabled={busy}><Text style={styles.link}>{t('productTools.removeDeadline')}</Text></Row>}
          {w.return_by != null && <Row separator onPress={() => void changeDate(null)} disabled={busy}><Text style={styles.link}>{t('productTools.resetDeadline')}</Text></Row>}
        </Group>
        <Text style={styles.note}>{t('productTools.returnHint')}</Text>
        <SectionHeader title={t('productTools.history')} />
        <Group>
          {links.original && relatedRow(links.original, t('productTools.replaces'))}
          {links.replacements.map(item => relatedRow(item, t('productTools.replacedBy')))}
          {!links.original && !links.replacements.length && <Text style={styles.empty}>{t('productTools.noHistory')}</Text>}
        </Group>
        {(links.original || links.replacements.length > 0) && <Button kind="glass" style={styles.unlink} title={t('productTools.unlink')} onPress={unlink} disabled={busy} />}
        <Text style={styles.note}>{t('productTools.historyHint')}</Text>
        <View style={styles.actions}>
          <Button title={t('productTools.link')} icon="link-outline" onPress={() => void chooseReplacement()} disabled={busy} />
          <Button kind="glass" title={t('productTools.add')} icon="add" onPress={() => router.push({ pathname: '/warranty/edit', params: { replacementFor: String(w.id) } })} disabled={busy} />
        </View>
      </>}
    </Page>
    {datePicker}
    <SheetFrame open={picker} onClose={() => setPicker(false)} title={t('productTools.link')}><SheetBody>
      <Text style={styles.note}>{t('productTools.selectHint')}</Text>
      <Group>{choices.length ? choices.map((c, i) => <Row key={c.id} separator={i > 0} disabled={busy} onPress={() => void link(c)}><Text style={styles.text}>{displayName(t, c)}</Text></Row>) : <Text style={styles.empty}>{t('productTools.noCandidates')}</Text>}</Group>
    </SheetBody></SheetFrame>
  </>;
}
const useStyles = themed(() => StyleSheet.create({
  unlink: { marginTop: 12 }, flex: { flex: 1, gap: 4 }, text: { ...TYPE.body, color: colors.ink, flexShrink: 1 }, hint: { ...TYPE.foot, color: colors.ink2 },
  link: { ...TYPE.body, color: colors.tint, flexShrink: 1 }, note: { ...TYPE.foot, color: colors.ink2, marginTop: 12, paddingHorizontal: 4 }, empty: { ...TYPE.body, color: colors.ink2, padding: 16 }, actions: { gap: 12, marginTop: 20 },
}));
