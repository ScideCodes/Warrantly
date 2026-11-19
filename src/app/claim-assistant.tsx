import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from '@/components/themeMotion';
import AppIcon from '@/components/Icon';
import { Page } from '@/components/Page';
import { Button, Group, Input, Row, SectionHeader } from '@/components/ui';
import { showAlert } from '@/components/Dialog';
import { displayName, formatDate } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { getWarranty, listAttachments, sharedWarranties, type Attachment, type Warranty } from '@/db/repo';
import { claimEmail } from '@/claim';
import { serialSummary } from '@/serialNumbers';
import { getUsername } from '@/settings';
import { documentExists, sendClaim } from '@/documents';
import { shareClaimPackage } from '@/dataTools';
import { transferHtml } from '@/transfer';
import { colors, TYPE, themed } from '@/theme';

export default function ClaimAssistant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const [w, setW] = useState<Warranty | null>(null);
  const [docs, setDocs] = useState<Attachment[]>([]);
  const [selected, setSelected] = useState(new Set<number>());
  const [to, setTo] = useState(''), [subject, setSubject] = useState(''), [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void getDb().then(async db => {
      const found = await getWarranty(db, Number(id));
      const files = found ? await listAttachments(db, found.id) : [];
      if (!live) return;
      if (found) {
        const draft = claimEmail(t, { product: displayName(t, found), purchaseDate: formatDate(found.purchase_date, i18n.language), endDate: formatDate(found.end_date, i18n.language), orderNumber: found.order_number, serialNumber: serialSummary(found), name: getUsername() });
        setTo(found.contact_email ?? ''); setSubject(draft.subject); setBody(draft.body);
      }
      setW(found); setDocs(files); setSelected(new Set(files.filter(d => documentExists(d.local_path)).map(d => d.id))); setLoaded(true);
    }).catch(e => { if (live) { setLoaded(true); showAlert(t('assistant.failed'), String(e)); } });
    return () => { live = false; };
  }, [id, t, i18n.language]);
  const chosen = docs.filter(d => selected.has(d.id));
  async function send(kind: 'email' | 'package') {
    if (!w || busy) return;
    setBusy(true);
    try {
      if (kind === 'email') await sendClaim(to.trim(), subject, body, chosen.map(d => d.local_path));
      else {
        const [item] = await sharedWarranties(await getDb(), [w.id]);
        item.documents = item.documents.filter(d => chosen.some(c => c.local_path === d.local_path));
        item.history = [];
        // Only the displayed claim facts, never unrelated private notes.
        delete item.warranty.notes;
        const rows = Object.fromEntries(['product_name', 'store_name', 'purchase_date', 'warranty_start_date', 'warranty_months', 'serial_number', 'order_number', 'coverage', 'price', 'currency'].map(k => [k, k === 'coverage' ? t('form.coverage') : t(`transfer.col_${k}`)]));
        item.warranty.coverage = t(`coverage.${w.coverage ?? 'standard'}`);
        const html = transferHtml(item, { title: displayName(t, w), rows, documents: t('transfer.documentsHeading'), note: t('assistant.summaryNote') });
        await shareClaimPackage(html, `${subject}\n\n${body}`, chosen);
      }
    } catch (e) { showAlert(t('assistant.failed'), e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <Page title={t('assistant.title')} lead={w ? displayName(t, w) : undefined}>
    {!loaded ? <Text style={styles.hint}>{t('form.loading')}</Text> : !w ? <Text style={styles.hint}>{t('transfer.unavailable')}</Text> : <>
      <SectionHeader title={t('assistant.email')} first />
      <Group style={styles.form}>
        <Input value={to} onChangeText={setTo} placeholder={t('assistant.recipient')} accessibilityLabel={t('assistant.recipient')} keyboardType="email-address" autoCapitalize="none" editable={!busy} />
        <Input value={subject} onChangeText={setSubject} accessibilityLabel={t('assistant.subject')} editable={!busy} />
        <Input value={body} onChangeText={setBody} accessibilityLabel={t('assistant.body')} multiline style={styles.body} editable={!busy} />
      </Group>
      <SectionHeader title={t('transfer.documents')} />
      <Group>{!docs.length ? <Text style={styles.empty}>{t('assistant.noDocs')}</Text> : docs.map((d, i) => <Row key={d.id} separator={i > 0} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(d.id) }} onPress={() => setSelected(s => { const next = new Set(s); if (!next.delete(d.id)) next.add(d.id); return next; })}>
        <AppIcon name={selected.has(d.id) ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected.has(d.id) ? colors.tint : colors.ink2} />
        <View style={styles.name}>
          <Text style={styles.file}>{d.filename}</Text>
          {!documentExists(d.local_path) && <Text style={styles.missing}>{t('detail.fileMissing')}</Text>}
        </View>
      </Row>)}</Group>
      <Text style={styles.hint}>{t('assistant.packageHint')}</Text>
      <View style={styles.actions}>
        <Button title={t('assistant.package')} icon="share-outline" onPress={() => void send('package')} busy={busy} disabled={busy || !subject.trim() || !body.trim()} />
        <Button kind="glass" title={t('assistant.email')} icon="mail-outline" onPress={() => void send('email')} disabled={busy || !subject.trim() || !body.trim()} />
      </View>
    </>}
  </Page>;
}
const useStyles = themed(() => StyleSheet.create({
  form: { padding: 16, gap: 12 }, body: { minHeight: 240, textAlignVertical: 'top' },
  hint: { ...TYPE.foot, color: colors.ink2, marginTop: 12, paddingHorizontal: 4 },
  empty: { ...TYPE.body, color: colors.ink2, padding: 16 }, name: { flex: 1, gap: 2 }, file: { ...TYPE.body, color: colors.ink }, missing: { ...TYPE.foot, color: colors.bad }, actions: { gap: 12, marginTop: 20 },
}));
