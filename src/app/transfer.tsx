import { Text, View } from '@/components/themeMotion';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppIcon from '@/components/Icon';
import { Page } from '@/components/Page';
import { displayName } from '@/components/WarrantyRow';
import { Button, Group, Row, SectionHeader } from '@/components/ui';
import { showAlert } from '@/components/Dialog';
import { sharePdf, shareTransferFile } from '@/dataTools';
import { getDb } from '@/db/client';
import { getWarranty, sharedWarranties, type SharedWarranty, type Warranty } from '@/db/repo.ts';
import { DEFAULT_FIELDS, TRANSFER_FIELDS, transferHtml, transferItem, type TransferField } from '@/transfer';
import { colors, TYPE, themed } from '@/theme';

// Transfer to a new owner (shortlist 18): selling or giving away an item with its warranty. The person ticks
// what goes; private details start unticked. A summary PDF or a Warrantly file is made from the ticked parts
// only, and sent with any app. Documents go as they are, which is said plainly.
export default function Transfer() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [w, setW] = useState<Warranty | null>(null);
  const [item, setItem] = useState<SharedWarranty | null>(null);
  const [fields, setFields] = useState(() => new Set<TransferField>(DEFAULT_FIELDS));
  const [docs, setDocs] = useState(() => new Set<number>());
  const [busy, setBusy] = useState<'pdf' | 'file' | null>(null);
  useEffect(() => {
    void getDb().then(async (db) => {
      setW(await getWarranty(db, Number(id)));
      const [found] = await sharedWarranties(db, [Number(id)]);
      setItem(found ?? null);
      setDocs(new Set((found?.documents ?? []).map((_, i) => i))); // documents are what a buyer needs most
    });
  }, [id]);
  const toggle = <K,>(set: Set<K>, k: K) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n; };

  if (!w || !item) return <Page title={t('transfer.title')}><View /></Page>;
  const name = displayName(t, w);
  const chosen = () => transferItem(item, fields, docs);
  const fileName = name.replace(/[^\p{L}\p{N} -]/gu, '').trim() || 'warranty';

  async function send(kind: 'pdf' | 'file') {
    setBusy(kind);
    try {
      if (kind === 'file') await shareTransferFile(chosen(), `${fileName}.warrantly.json`);
      else {
        const rows = Object.fromEntries(['product_name', 'store_name', 'purchase_date', 'warranty_start_date', 'warranty_months', 'serial_number', 'order_number', 'price', 'currency',
          'contact_email', 'contact_phone', 'website_url', 'notes'].map((k) => [k, t(`transfer.col_${k}`)]));
        await sharePdf(`${fileName}.pdf`, transferHtml(chosen(), { title: name, rows, documents: t('transfer.documentsHeading'), note: t('transfer.pdfNote') }));
      }
    } catch (e) {
      showAlert(t('transfer.failed'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const check = (on: boolean, label: string, onPress: () => void, separator: boolean, hint?: string) => (
    <Row separator={separator} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} iconInset>
      <AppIcon name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.tint : colors.ink3} />
      <View style={styles.flex}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Row>
  );

  return (
    <Page
      title={t('transfer.title')}
      lead={t('transfer.lead', { name })}
      footer={
        <View style={styles.actions}>
          <Button title={t('transfer.sendFile')} icon="share-outline" onPress={() => void send('file')} busy={busy === 'file'} disabled={busy !== null} />
          <Button kind="glass" title={t('transfer.sendPdf')} icon="document-text-outline" onPress={() => void send('pdf')} busy={busy === 'pdf'} disabled={busy !== null} />
        </View>
      }
    >
      <SectionHeader title={t('transfer.always')} />
      <Group><Row accessibilityRole="text"><Text style={styles.hint}>{t('transfer.alwaysBody')}</Text></Row></Group>
      <SectionHeader title={t('transfer.details')} />
      <Group>
        {TRANSFER_FIELDS.map((f, i) => check(fields.has(f), t(`transfer.field_${f}`), () => setFields((s) => toggle(s, f)), i > 0))}
      </Group>
      {item.documents.length > 0 && (
        <>
          <SectionHeader title={t('transfer.documents')} />
          <Group>
            {item.documents.map((d, i) => check(docs.has(i), d.filename, () => setDocs((s) => toggle(s, i)), i > 0, d.label ? t(`docLabel.${d.label}`) : undefined))}
          </Group>
        </>
      )}
      <View style={styles.note}>
        <AppIcon name="information-circle-outline" size={20} color={colors.ink2} />
        <Text style={styles.noteText}>{t('transfer.privacy')}</Text>
      </View>
    </Page>
  );
}

const useStyles = themed(() => StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  label: { ...TYPE.body, color: colors.ink },
  hint: { ...TYPE.foot, color: colors.ink2, flex: 1 },
  note: { flexDirection: 'row', gap: 8, marginTop: 16, paddingHorizontal: 4 },
  noteText: { flex: 1, ...TYPE.foot, color: colors.ink2 },
  actions: { gap: 8 },
}));
