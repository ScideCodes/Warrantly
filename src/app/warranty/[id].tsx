import { useCallback, useState } from 'react';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { agoLabel, daysLabel, displayName, formatDate, lengthLabel } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { deleteWarranty, getWarranty, ignoreWarranty, listAttachments, type Attachment, type Warranty } from '@/db/repo.ts';
import { deleteDocuments, openDocument, sendClaim } from '@/documents';
import { claimEmail } from '@/claim';
import { sendTestReminder } from '@/reminders';
import { getUsername } from '@/settings';
import { colors } from '@/theme';
import { daysUntil, todayYmd, urgency } from '@/warranty';

// Warranty detail (section 13). Editing, PDFs and the claim helper come in later build steps.
export default function WarrantyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [w, setW] = useState<Warranty | null>(null);
  const [docs, setDocs] = useState<Attachment[]>([]);
  // Reload on focus so changes made in the edit screen show up.
  useFocusEffect(
    useCallback(() => {
      void getDb().then(async (db) => {
        setW(await getWarranty(db, Number(id)));
        setDocs(await listAttachments(db, Number(id)));
      });
    }, [id]),
  );

  if (!w) return <Stack.Screen options={{ headerShown: true, title: '' }} />;

  const today = todayYmd();
  const days = daysUntil(w.end_date, today);
  const pill = colors[urgency(days)];
  const date = (ymd: string) => formatDate(ymd, i18n.language);
  const suggested = (value: string, isSuggested: number) => (isSuggested ? t('warranty.suggested', { value }) : value);
  const product = displayName(t, w);

  async function notWarranty() {
    await ignoreWarranty(await getDb(), w!.id);
    router.back();
  }

  function confirmDelete() {
    Alert.alert(t('detail.deleteTitle', { product }), t('detail.deleteBody'), [
      { text: t('detail.cancel'), style: 'cancel' },
      {
        text: t('detail.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          deleteDocuments(await deleteWarranty(await getDb(), w!.id)); // stored PDFs go too (section 10)
          router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: w.store_name,
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/warranty/edit', params: { id: String(w.id) } })} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.headerButton}>{t('detail.edit')}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {product}
        </Text>
        <View style={[styles.pill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.pillText, { color: pill.fg }]}>{daysLabel(t, days)}</Text>
        </View>
        {w.status === 'needs_input' && <Text style={styles.note}>{t('warranty.needsInput')}</Text>}

        {w.product_name && w.product_name !== product && <Field label={t('detail.fullName')} value={w.product_name} />}
        <Field label={t('warranty.store')} value={w.store_name} />
        <Field label={t('warranty.purchaseDate')} value={`${date(w.purchase_date)} (${agoLabel(t, w.purchase_date, today)})`} />
        <Field label={t('warranty.startDate')} value={suggested(date(w.warranty_start_date), w.start_is_suggested)} />
        <Field label={t('warranty.length')} value={lengthLabel(t, w)} />
        <Field label={t('warranty.endDate')} value={date(w.end_date)} />
        {w.order_number && <Field label={t('warranty.orderNumber')} value={w.order_number} />}
        {w.contact_email && <Field label={t('warranty.contact')} value={w.contact_email} url={`mailto:${w.contact_email}`} />}
        {w.contact_phone && <Field label={t('warranty.contact')} value={w.contact_phone} url={`tel:${w.contact_phone.replace(/[^\d+]/g, '')}`} />}
        {w.website_url && <Field label={t('warranty.website')} value={w.website_url.replace(/^https:\/\//, '')} url={w.website_url} />}
        {w.serial_number && <Field label={t('detail.serial')} value={w.serial_number} />}
        {w.notes && <Field label={t('detail.notes')} value={w.notes} />}

        {docs.map((d) => (
          <Pressable key={d.id} style={styles.secondary} onPress={() => openDocument(d.local_path)} accessibilityRole="button">
            <Text style={styles.secondaryText}>{t('detail.openDocument')}</Text>
          </Pressable>
        ))}
        {days >= 0 && (
          // Section 20: not offered once the warranty has expired.
          <View style={styles.claim}>
            {w.contact_email ? (
              <Pressable
                style={styles.primary}
                onPress={() => {
                  const { subject, body } = claimEmail(t, {
                    product: w.product_name ?? t('warranty.unknownProduct'),
                    purchaseDate: date(w.purchase_date),
                    endDate: date(w.end_date),
                    orderNumber: w.order_number,
                    serialNumber: w.serial_number,
                    name: getUsername(),
                  });
                  sendClaim(w.contact_email!, subject, body, docs.map((d) => d.local_path)).catch(() => Alert.alert(t('detail.noMailApp')));
                }}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>{t('detail.claim')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.note}>{t('detail.claimNoEmail')}</Text>
            )}
          </View>
        )}
        <Pressable
          style={styles.secondary}
          onPress={async () => {
            if (!(await sendTestReminder(w, days))) Alert.alert(t('detail.noPermission'));
          }}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{t('detail.testReminder')}</Text>
        </Pressable>
        {w.status === 'needs_input' && (
          <Pressable style={styles.secondary} onPress={notWarranty} accessibilityRole="button">
            <Text style={styles.secondaryText}>{t('detail.notWarranty')}</Text>
          </Pressable>
        )}
        {days < 0 && (
          <Pressable style={styles.secondary} onPress={confirmDelete} accessibilityRole="button">
            <Text style={[styles.secondaryText, styles.danger]}>{t('detail.delete')}</Text>
          </Pressable>
        )}
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
  claim: { marginTop: 16 },
  primary: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
  headerButton: { fontSize: 16, fontWeight: '600', color: colors.primary, paddingHorizontal: 8 },
  secondary: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
  danger: { color: colors.soon.fg },
});
