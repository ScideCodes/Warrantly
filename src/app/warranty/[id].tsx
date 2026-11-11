import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { agoLabel, daysLabel, formatDate, lengthLabel } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { getWarranty, type Warranty } from '@/db/repo.ts';
import { colors } from '@/theme';
import { daysUntil, todayYmd, urgency } from '@/warranty';

// Warranty detail (section 13). Editing, PDFs and the claim helper come in later build steps.
export default function WarrantyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [w, setW] = useState<Warranty | null>(null);
  useEffect(() => {
    void getDb()
      .then((db) => getWarranty(db, Number(id)))
      .then(setW);
  }, [id]);

  if (!w) return <Stack.Screen options={{ headerShown: true, title: '' }} />;

  const today = todayYmd();
  const days = daysUntil(w.end_date, today);
  const pill = colors[urgency(days)];
  const date = (ymd: string) => formatDate(ymd, i18n.language);
  const suggested = (value: string, isSuggested: number) => (isSuggested ? t('warranty.suggested', { value }) : value);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: w.store_name }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {w.product_name ?? t('warranty.unknownProduct')}
        </Text>
        <View style={[styles.pill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.pillText, { color: pill.fg }]}>{daysLabel(t, days)}</Text>
        </View>
        {w.status === 'needs_input' && <Text style={styles.note}>{t('warranty.needsInput')}</Text>}

        <Field label={t('warranty.store')} value={w.store_name} />
        <Field label={t('warranty.purchaseDate')} value={`${date(w.purchase_date)} (${agoLabel(t, w.purchase_date, today)})`} />
        <Field label={t('warranty.startDate')} value={suggested(date(w.warranty_start_date), w.start_is_suggested)} />
        <Field label={t('warranty.length')} value={lengthLabel(t, w)} />
        <Field label={t('warranty.endDate')} value={date(w.end_date)} />
        {w.order_number && <Field label={t('warranty.orderNumber')} value={w.order_number} />}
        {w.contact_email && <Field label={t('warranty.contact')} value={w.contact_email} url={`mailto:${w.contact_email}`} />}
        {w.contact_phone && <Field label={t('warranty.contact')} value={w.contact_phone} url={`tel:${w.contact_phone.replace(/[^\d+]/g, '')}`} />}
        {w.website_url && <Field label={t('warranty.website')} value={w.website_url.replace(/^https:\/\//, '')} url={w.website_url} />}
      </ScrollView>
    </>
  );
}

function Field({ label, value, url }: { label: string; value: string; url?: string }) {
  const body = (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, url && styles.link]}>{value}</Text>
    </>
  );
  return url ? (
    <Pressable style={styles.field} onPress={() => Linking.openURL(url)} accessibilityRole="link">
      {body}
    </Pressable>
  ) : (
    <View style={styles.field}>{body}</View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 4 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  pill: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginVertical: 8 },
  pillText: { fontSize: 14, fontWeight: '600' },
  note: { fontSize: 14, color: colors.warning.fg, marginBottom: 8 },
  field: { paddingVertical: 10, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted },
  value: { fontSize: 16, color: colors.text },
  link: { color: colors.primary },
});
