import { useCallback, useState } from 'react';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/nav';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { agoLabel, daysLabel, displayName, formatDate, formatMoney, lengthLabel, WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import {
  addAttachment, addHistory, deleteAttachment, deleteHistory, deleteWarranty, getWarranty, ignoreWarranty, listAttachments, listHistory, otherCovers,
  type Attachment, type HistoryEntry, type Warranty,
} from '@/db/repo.ts';
import { shareWarranties } from '@/dataTools';
import { deleteDocuments, documentExists, importDocument, scanDocument, sendClaim } from '@/documents';
import { claimEmail } from '@/claim';
import { sendTestReminder } from '@/reminders';
import { getUsername } from '@/settings';
import { colors } from '@/theme';
import { daysUntil, returnDeadline, todayYmd, urgency } from '@/warranty';

// Warranty detail (section 13). Editing, PDFs and the claim helper come in later build steps.
export default function WarrantyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [w, setW] = useState<Warranty | null>(null);
  const [docs, setDocs] = useState<Attachment[]>([]);
  const [others, setOthers] = useState<Warranty[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [note, setNote] = useState('');
  // Reload on focus so changes made in the edit screen show up.
  useFocusEffect(
    useCallback(() => {
      void getDb().then(async (db) => {
        const found = await getWarranty(db, Number(id));
        setW(found);
        setDocs(await listAttachments(db, Number(id)));
        setOthers(found ? await otherCovers(db, found) : []);
        setHistory(await listHistory(db, Number(id)));
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

  function confirmRemoveDocument(d: Attachment) {
    Alert.alert(t('detail.removeDocumentTitle'), t('detail.deleteBody'), [
      { text: t('detail.cancel'), style: 'cancel' },
      {
        text: t('detail.removeDocument'),
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          const file = await deleteAttachment(db, d.id);
          if (file) deleteDocuments([file]);
          setDocs(await listAttachments(db, w!.id));
        },
      },
    ]);
  }

  // Any warranty can get a document later (scanned, or a photo or PDF from the phone), e.g. the paper
  // invoice of a mail-imported purchase.
  async function attach(source: typeof scanDocument) {
    try {
      const result = await source();
      if (!result) return;
      const db = await getDb();
      await addAttachment(db, w!.id, docs.length ? `${product} (${docs.length + 1}).pdf` : `${product}.pdf`, result.localPath); // names tell them apart
      setDocs(await listAttachments(db, w!.id));
    } catch (e) {
      Alert.alert(t('form.scanFailed', { detail: e instanceof Error ? e.message : String(e) }));
    }
  }

  // Repairs, claims, calls with the shop: dated notes, newest first.
  async function addNote() {
    if (!note.trim()) return;
    const db = await getDb();
    await addHistory(db, w!.id, today, note.trim());
    setNote('');
    setHistory(await listHistory(db, w!.id));
  }

  function confirmDeleteNote(h: HistoryEntry) {
    Alert.alert(t('detail.deleteNote'), h.note, [
      { text: t('detail.cancel'), style: 'cancel' },
      {
        text: t('detail.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          await deleteHistory(db, h.id);
          setHistory(await listHistory(db, w!.id));
        },
      },
    ]);
  }

  // Section 20 helper: the manufacturer's own service is often better than the shop. The brand is the
  // first word of the product name; the search does the rest.
  const brand = w.product_name?.trim().split(/\s+/)[0] ?? null;

  async function notWarranty() {
    await ignoreWarranty(await getDb(), w!.id);
    goBack();
  }

  function confirmDelete() {
    Alert.alert(t('detail.deleteTitle', { product }), t('detail.deleteBody'), [
      { text: t('detail.cancel'), style: 'cancel' },
      {
        text: t('detail.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          deleteDocuments(await deleteWarranty(await getDb(), w!.id)); // stored PDFs go too (section 10)
          goBack();
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
        {w.coverage && <Field label={t('form.coverage')} value={t(`coverage.${w.coverage}`)} />}
        <Field label={t('warranty.length')} value={lengthLabel(t, w)} />
        <Field label={t('warranty.endDate')} value={date(w.end_date)} />
        {(() => {
          const returnBy = returnDeadline(w);
          return returnBy && returnBy >= today ? <Field label={t('detail.returnBy')} value={`${date(returnBy)} (${t('detail.returnHint')})`} /> : null;
        })()}
        {w.price !== null && w.currency && <Field label={t('form.price')} value={formatMoney(w.price, w.currency, i18n.language)} />}
        {w.category && <Field label={t('form.category')} value={t(`category.${w.category}`)} />}
        {w.order_number && <Field label={t('warranty.orderNumber')} value={w.order_number} />}
        {w.contact_email && <Field label={t('warranty.contact')} value={w.contact_email} url={`mailto:${w.contact_email}`} />}
        {w.contact_phone && <Field label={t('warranty.contact')} value={w.contact_phone} url={`tel:${w.contact_phone.replace(/[^\d+]/g, '')}`} />}
        {w.website_url && <Field label={t('warranty.website')} value={w.website_url.replace(/^https:\/\//, '')} url={w.website_url} />}
        {w.serial_number && <Field label={t('detail.serial')} value={w.serial_number} />}
        {w.notes && <Field label={t('detail.notes')} value={w.notes} />}

        {docs.map((d) => (
          <View key={d.id} style={styles.docRow}>
          <Pressable
            style={[styles.secondary, styles.docOpen]}
            onPress={() =>
              documentExists(d.local_path)
                ? router.push({ pathname: '/document', params: { path: d.local_path, title: product } })
                : Alert.alert(t('detail.documentMissing'))
            }
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText} numberOfLines={1}>
              {docs.length > 1 ? d.filename : t('detail.openDocument')}
            </Text>
          </Pressable>
          <Pressable style={[styles.secondary, styles.docRemove]} onPress={() => confirmRemoveDocument(d)} accessibilityRole="button" accessibilityLabel={t('detail.removeDocument')}>
            <Text style={[styles.secondaryText, styles.danger]}>{t('detail.removeDocument')}</Text>
          </Pressable>
          </View>
        ))}
        {brand && (
          <Pressable
            style={styles.secondary}
            onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(`${brand} ${t('detail.supportQuery')}`)}`)}
            accessibilityRole="link"
          >
            <Text style={styles.secondaryText}>{t('detail.brandSupport', { brand })}</Text>
          </Pressable>
        )}
        <View style={styles.history}>
          <Text style={styles.label}>{t('detail.history')}</Text>
          {history.map((h) => (
            <Pressable key={h.id} onLongPress={() => confirmDeleteNote(h)} accessibilityHint={t('detail.deleteNoteHint')}>
              <Text style={styles.value}>
                {date(h.date)}: {h.note}
              </Text>
            </Pressable>
          ))}
          <View style={styles.noteRow}>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder={t('detail.notePlaceholder')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('detail.history')}
              onSubmitEditing={addNote}
            />
            <Pressable style={styles.noteAdd} onPress={addNote} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('detail.addNote')}</Text>
            </Pressable>
          </View>
        </View>
        {others.length > 0 && (
          <View>
            <Text style={styles.label}>{t('detail.otherCovers')}</Text>
            {others.map((o) => (
              <WarrantyRow key={o.id} warranty={o} />
            ))}
          </View>
        )}
        <Pressable
          style={styles.secondary}
          onPress={() => getDb().then((db) => shareWarranties(db, [w.id], `warrantly-${product.replace(/[^\w-]+/g, '-')}.json`)).catch((e) => Alert.alert(String(e)))}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{t('detail.share')}</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={() => router.push({ pathname: '/warranty/edit', params: { copyFrom: String(w.id) } })}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{t('detail.addCover')}</Text>
        </Pressable>
        {/* Any number of documents: invoice, warranty card, repair sheet. */}
        <Pressable style={styles.secondary} onPress={() => attach(scanDocument)} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('detail.attachScan')}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => attach(importDocument)} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('detail.attachImport')}</Text>
        </Pressable>
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
        {/* Any warranty can be deleted (owner's choice, wider than section 10); a deleted mail warranty
            keeps its source marker, so sync never brings it back. */}
        <Pressable style={styles.secondary} onPress={confirmDelete} accessibilityRole="button">
          <Text style={[styles.secondaryText, styles.danger]}>{t('detail.delete')}</Text>
        </Pressable>
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
  history: { gap: 6 },
  noteRow: { flexDirection: 'row', gap: 8 },
  noteInput: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, fontSize: 16, color: colors.text },
  noteAdd: { minHeight: 48, minWidth: 64, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
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
  docRow: { flexDirection: 'row', gap: 8 },
  docOpen: { flex: 1 },
  docRemove: { paddingHorizontal: 16 },
  primary: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
  headerButton: { fontSize: 16, fontWeight: '600', color: colors.primary, paddingHorizontal: 8 },
  secondary: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
  danger: { color: colors.soon.fg },
});
