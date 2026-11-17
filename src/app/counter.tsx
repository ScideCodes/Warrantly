import { Text, View } from '@/components/themeMotion';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, PixelRatio, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Brightness from 'expo-brightness';
import PdfPages, { type PdfPage } from '../../modules/pdf-pages';
import { Page } from '@/components/Page';
import { Field, Section } from '@/components/Section';
import { formatDate } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { getWarranty, listAttachments, type Attachment, type Warranty } from '@/db/repo.ts';
import { documentExists, documentUri } from '@/documents';
import { serialEntries } from '@/serialNumbers';
import { colors, gutter, RADIUS, TYPE, themed } from '@/theme';

// Counter mode: what a shop assistant asks for, large, with the receipt under it and the screen at full
// brightness while it is open. The receipt is the document labelled as one, else the warranty card, else the first.
export default function Counter() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [w, setW] = useState<Warranty | null>(null);
  const [pages, setPages] = useState<PdfPage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const pageWidth = Math.min(width, 720) - 2 * gutter(width);

  useEffect(() => {
    void Brightness.setBrightnessAsync(1).catch(() => {}); // this screen only; the system level is untouched
    return () => void Brightness.restoreSystemBrightnessAsync().catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const db = await getDb();
      const n = Number(id);
      const [found, docs] = await Promise.all([getWarranty(db, n), listAttachments(db, n)]);
      if (!active) return;
      setW(found);
      const doc = pickReceipt(docs.filter((d) => documentExists(d.local_path)));
      if (!doc) { setPages([]); return; }
      const px = Math.min(Math.round(PixelRatio.getPixelSizeForLayoutSize(pageWidth) * 1.5), 2400);
      const rendered = await PdfPages.render(documentUri(doc.local_path), px);
      if (active) setPages(rendered);
    })().catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [id, pageWidth]);

  if (!w) return <Page title={t('counter.title')}>{failed && <Text style={styles.note}>{t('counter.failed')}</Text>}</Page>;
  const date = (ymd: string) => formatDate(ymd, i18n.language);
  const facts = [
    { label: t('warranty.purchaseDate'), value: date(w.purchase_date) },
    { label: t('form.store'), value: w.store_name },
    w.order_number && { label: t('warranty.orderNumber'), value: w.order_number },
    ...serialEntries(w).map((s) => ({ label: s.label || t('detail.serial'), value: s.value })),
    { label: t('warranty.endDate'), value: date(w.end_date) },
  ].filter((f): f is { label: string; value: string } => !!f);

  return (
    <Page
      title={w.product_name ?? t('counter.title')}
      head={
        <View style={styles.hero}>
          <Text style={styles.bought}>{t('counter.bought', { date: date(w.purchase_date) })}</Text>
        </View>
      }
    >
      <Section title={t('counter.details')} first>
        {facts.map((f, i) => <Field key={f.label + i} label={f.label} value={f.value} last={i === facts.length - 1} />)}
      </Section>
      <Section title={t('counter.receipt')}>
        {failed ? <Text style={styles.note}>{t('counter.failed')}</Text>
          : !pages ? <ActivityIndicator style={styles.loading} color={colors.tint} />
          : pages.length === 0 ? <Text style={styles.note}>{t('counter.noReceipt')}</Text>
          : pages.map((p) => (
            <Image key={p.uri} source={{ uri: p.uri }} style={[styles.page, { width: pageWidth, height: (pageWidth * p.height) / p.width }]}
              accessibilityLabel={t('counter.receipt')} accessibilityIgnoresInvertColors />
          ))}
      </Section>
    </Page>
  );
}

const ORDER = ['receipt', 'warranty_card'];
function pickReceipt(docs: Attachment[]): Attachment | undefined {
  return [...docs].sort((a, b) => rank(a) - rank(b))[0];
}
const rank = (d: Attachment) => { const i = ORDER.indexOf(d.label); return i < 0 ? ORDER.length : i; };

const useStyles = themed(() => StyleSheet.create({
  hero: { gap: 6, paddingTop: 4, paddingHorizontal: 4 },
  bought: { ...TYPE.title3, color: colors.ink, fontVariant: ['tabular-nums'] },
  page: { backgroundColor: '#fff', borderRadius: RADIUS }, // paper stays white in dark mode
  loading: { paddingVertical: 32 },
  note: { ...TYPE.body, color: colors.ink2, padding: 16 },
}));
