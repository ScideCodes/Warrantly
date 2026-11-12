import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/nav';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDb } from '@/db/client';
import {
  addAttachment, addManual, applyLengthToStore, getWarranty, ignoreWarranty, listAccounts, nextNeedsInput, saveStoreRule, sourceOf,
  storeItemsMissingLength, updateWarranty, type Account, type Warranty,
} from '@/db/repo.ts';
import { gmailTokenFor } from '@/google';
import { gmailProvider } from '@/mail/gmail.ts';
import { colors, BUTTON_HEIGHT, BUTTON_RADIUS } from '@/theme';
import { formatDate } from '@/components/WarrantyRow';
import { deleteDocuments, fileToDocument, importDocument, scanDocument } from '@/documents';
import { takeSharedFile } from '@/shareInbox';
import { parseScanText } from '@/parser/scan.ts';
import { getLocales } from 'expo-localization';
import { CATEGORIES, formErrors, isValidYmd, todayYmd, type FormField } from '@/warranty';

const LENGTH_CHOICES = [12, 24, 36];
type Form = Record<FormField | 'order_number' | 'serial_number' | 'contact_email' | 'contact_phone' | 'website_url' | 'notes' | 'price' | 'currency' | 'category', string>;

const localCurrency = () => getLocales()[0]?.currencyCode ?? 'EUR';

const fromWarranty = (w: Warranty | null): Form => ({
  product_name: w?.product_name ?? '',
  store_name: w?.store_name ?? '',
  purchase_date: w?.purchase_date ?? todayYmd(),
  warranty_start_date: w?.warranty_start_date ?? '',
  warranty_months: String(w?.warranty_months ?? 24),
  order_number: w?.order_number ?? '',
  serial_number: w?.serial_number ?? '',
  contact_email: w?.contact_email ?? '',
  contact_phone: w?.contact_phone ?? '',
  website_url: w?.website_url ?? '',
  notes: w?.notes ?? '',
  price: w?.price != null ? String(w.price) : '',
  currency: w?.currency ?? localCurrency(),
  category: w?.category ?? '',
});

// Manual add, and edit of any warranty (section 9 resolve view, section 18 manual add).
// Dates open the system calendar on Android; elsewhere (web previews, iOS for now) they are typed as YYYY-MM-DD.
export default function EditWarranty() {
  // copyFrom: "Add another warranty" for the same purchase (extended plan, store warranty).
  // shared: a file sent from another app is waiting in the share inbox.
  // scan: opened from the app icon's "Scan receipt" shortcut.
  const { id, copyFrom, shared, scan: scanNow } = useLocalSearchParams<{ id?: string; copyFrom?: string; shared?: string; scan?: string }>();
  const { t, i18n } = useTranslation();
  const [existing, setExisting] = useState<Warranty | null>(null);
  const [form, setForm] = useState<Form>(fromWarranty(null));
  const [errors, setErrors] = useState<FormField[]>([]);
  const [remember, setRemember] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null); // null = the Manual tab
  const [coverage, setCoverage] = useState<'store' | 'extended' | null>(null);
  const [scan, setScan] = useState<{ state: 'idle' | 'busy' | 'done' | 'attached' | 'failed'; detail?: string }>({ state: 'idle' });
  const scannedPdf = useRef<string | null>(null); // deleted again if the form is left without saving
  useEffect(
    () => () => {
      if (scannedPdf.current) deleteDocuments([scannedPdf.current]);
    },
    [],
  );
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [pickerError, setPickerError] = useState<string | null>(null); // the calendar failed: fall back to typing
  const [mail, setMail] = useState<{ state: 'hidden' | 'loading' | 'shown'; text?: string }>({ state: 'hidden' });
  const resolving = existing?.status === 'needs_input'; // section 9 resolve view
  // A new warranty asks only for the essentials; the rest opens on request, or by itself when there is
  // something in it to see (editing, a copied purchase, a scan, an error in the start date).
  const [more, setMore] = useState(false);
  const showMore = more || !!id || !!copyFrom || scan.state === 'done' || errors.includes('warranty_start_date');

  useEffect(() => {
    void getDb().then(async (db) => {
      setAccounts(await listAccounts(db));
      if (copyFrom) {
        const from = await getWarranty(db, Number(copyFrom));
        if (!from) return;
        setForm({ ...fromWarranty(null), product_name: from.product_name ?? '', store_name: from.store_name, purchase_date: from.purchase_date,
          warranty_start_date: from.warranty_start_date, category: from.category ?? '', order_number: from.order_number ?? '', serial_number: from.serial_number ?? '' });
        setAccountId(from.account_id);
        setCoverage('extended');
        return;
      }
      if (!id) return;
      const w = await getWarranty(db, Number(id));
      setExisting(w);
      setForm(fromWarranty(w));
      setAccountId(w?.account_id ?? null);
      setCoverage(w?.coverage ?? null);
      // "Next" reuses this screen with a new id: start the item fresh.
      setErrors([]);
      setRemember(false);
      setMail({ state: 'hidden' });
    });
  }, [id, copyFrom]);

  useEffect(() => {
    const file = shared ? takeSharedFile() : null;
    if (file) void runScan(() => fileToDocument(file.uri, file.name, file.mimeType));
    else if (scanNow && !id) void runScan(scanDocument);
  }, [shared, scanNow]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const saving = useRef(false);
  async function save() {
    const found = formErrors(form);
    setErrors(found);
    if (found.length) {
      scroll.current?.scrollTo({ y: 0 }); // the required fields are at the top
      return;
    }
    if (saving.current) return; // a double tap would add the warranty twice
    saving.current = true;
    try {
      await persist();
    } finally {
      saving.current = false;
    }
  }

  async function persist() {
    const opt = (s: string) => s.trim() || null;
    const input = {
      account_id: accountId,
      product_name: form.product_name.trim(),
      store_name: form.store_name.trim(),
      purchase_date: form.purchase_date,
      warranty_start_date: form.warranty_start_date || form.purchase_date,
      warranty_months: Number(form.warranty_months),
      order_number: opt(form.order_number),
      serial_number: opt(form.serial_number),
      contact_email: opt(form.contact_email),
      contact_phone: opt(form.contact_phone),
      website_url: opt(form.website_url),
      notes: opt(form.notes),
      // "105 263" or "49,90" as typed; anything that is not a number is left empty.
      price: form.price.trim() && Number.isFinite(Number(form.price.replace(/\s/g, '').replace(',', '.'))) ? Number(form.price.replace(/\s/g, '').replace(',', '.')) : null,
      currency: form.price.trim() ? form.currency.trim().toUpperCase() || localCurrency() : null,
      category: opt(form.category),
      coverage,
    };
    const db = await getDb();
    if (existing) await updateWarranty(db, existing.id, input);
    else {
      const id = await addManual(db, input, scannedPdf.current ? 'scan' : 'manual');
      if (scannedPdf.current) await addAttachment(db, id, `${input.product_name}.pdf`, scannedPdf.current);
      scannedPdf.current = null; // saved: keep the file
    }
    if (remember && existing?.store_domain) await saveStoreRule(db, existing.store_domain, input.warranty_months);
    if (!resolving) return goBack();
    // Section 9 batch help: offer the same length to this store's other items that are missing it.
    const others = existing?.store_domain ? await storeItemsMissingLength(db, existing.store_domain, existing.id) : 0;
    if (others && (await askApply(input.warranty_months, others, input.store_name))) {
      await applyLengthToStore(db, existing!.store_domain!, input.warranty_months, existing!.id);
    }
    await goNext();
  }

  const askApply = (months: number, count: number, store: string) =>
    new Promise<boolean>((resolve) =>
      Alert.alert(t('attention.applyTitle', { months, count, store }), undefined, [
        { text: t('attention.applyNo'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('attention.applyYes'), onPress: () => resolve(true) },
      ]),
    );

  // Section 9: move through the items quickly; back to the list when none are left.
  async function goNext() {
    const next = existing ? await nextNeedsInput(await getDb(), existing.id) : null;
    if (next) router.replace({ pathname: '/warranty/edit', params: { id: String(next) } });
    else goBack();
  }

  async function notWarranty() {
    await ignoreWarranty(await getDb(), existing!.id);
    await goNext();
  }

  // Section 9 source viewer: the mail is not stored on the phone, so fetch it from Gmail when asked.
  async function toggleMail() {
    if (mail.state !== 'hidden') return setMail({ state: 'hidden' });
    setMail({ state: 'loading' });
    try {
      const src = await sourceOf(await getDb(), existing!.id);
      if (!src) throw new Error(t('form.noEmail'));
      const message = await gmailProvider(gmailTokenFor(src.email)).getMessage(src.message_id);
      setMail({ state: 'shown', text: `${message.subject}\n\n${message.text}` });
    } catch (e) {
      setMail({ state: 'shown', text: e instanceof Error ? e.message : String(e) });
    }
  }

  // Section 18: scan a paper receipt or warranty card, or import a photo or PDF; what OCR finds fills the
  // empty fields (an imported PDF is attached as it is, nothing is read from it).
  async function runScan(source: typeof scanDocument) {
    setScan({ state: 'busy' });
    try {
      const result = await source();
      if (!result) return setScan({ state: 'idle' });
      if (scannedPdf.current) deleteDocuments([scannedPdf.current]); // a second scan replaces the first
      scannedPdf.current = result.localPath;
      const found = parseScanText(result.text, todayYmd());
      setForm((f) => ({
        ...f,
        product_name: f.product_name || found.productName || '',
        store_name: f.store_name || found.storeName || '',
        purchase_date: found.purchaseDate ?? f.purchase_date,
        warranty_months: found.warrantyMonths ? String(found.warrantyMonths) : f.warranty_months,
        order_number: f.order_number || found.orderNumber || '',
      }));
      setScan({ state: result.text ? 'done' : 'attached' });
    } catch (e) {
      setScan({ state: 'failed', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  const pickDate = (key: 'purchase_date' | 'warranty_start_date') => {
    const current = form[key] || form.purchase_date;
    const [y, m, d] = (isValidYmd(current) ? current : todayYmd()).split('-').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(y, m - 1, d),
      mode: 'date',
      onValueChange: (_event, date) => set(key)(todayYmd(date)),
      // The library swallows native errors unless asked; show it and let the user type the date instead.
      onError: (e) => setPickerError(e instanceof Error ? e.message : String(e)),
    });
  };

  const field = (key: keyof Form, label: string, opts: { hint?: string; error?: string; keyboard?: KeyboardTypeOptions; multiline?: boolean; date?: boolean } = {}) => {
    const invalid = errors.includes(key as FormField);
    if (opts.date && Platform.OS === 'android' && !pickerError) {
      const value = form[key];
      return (
        <View style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <Pressable
            testID={key}
            style={[styles.input, styles.dateInput, invalid && styles.inputError]}
            onPress={() => pickDate(key as 'purchase_date' | 'warranty_start_date')}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value ? formatDate(value, i18n.language) : ''}`}
          >
            <Text style={[styles.dateText, !value && styles.datePlaceholder]}>
              {value ? formatDate(value, i18n.language) : formatDate(form.purchase_date, i18n.language)}
            </Text>
          </Pressable>
          {invalid && opts.error ? <Text style={styles.error}>{opts.error}</Text> : key === 'warranty_start_date' && <Text style={styles.hint}>{opts.hint}</Text>}
        </View>
      );
    }
    return (
      <View style={styles.field}>
        <Text style={styles.label} nativeID={`${key}-label`}>
          {label}
        </Text>
        <TextInput
          testID={key} // a stable handle for UI tests (Maestro)
          style={[styles.input, opts.multiline && styles.multiline, invalid && styles.inputError]}
          value={form[key]}
          onChangeText={set(key)}
          keyboardType={opts.keyboard}
          multiline={opts.multiline}
          autoCapitalize={opts.keyboard ? 'none' : 'sentences'}
          accessibilityLabelledBy={`${key}-label`}
          accessibilityHint={opts.hint}
        />
        {opts.date && pickerError && <Text style={styles.hint}>{t('form.pickerFailed', { detail: pickerError })}</Text>}
        {invalid && opts.error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {opts.error}
          </Text>
        ) : (
          opts.hint && <Text style={styles.hint}>{opts.hint}</Text>
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t(id ? 'form.titleEdit' : 'form.titleAdd') }} />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {resolving && existing?.origin === 'gmail' && (
            <View style={styles.field}>
              <Pressable style={styles.secondary} onPress={toggleMail} accessibilityRole="button">
                {mail.state === 'loading' ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t(mail.state === 'shown' ? 'form.hideEmail' : 'form.showEmail')}</Text>}
              </Pressable>
              {mail.state === 'shown' && (
                <ScrollView style={styles.mailBox} nestedScrollEnabled>
                  <Text style={styles.mailText} selectable>
                    {mail.text}
                  </Text>
                </ScrollView>
              )}
            </View>
          )}
          {!existing && (
            <View style={styles.field}>
              <Pressable
                style={({ pressed }) => [styles.scanCard, pressed && styles.scanPressed]}
                onPress={() => runScan(scanDocument)}
                disabled={scan.state === 'busy'}
                accessibilityRole="button"
                accessibilityLabel={t('form.scan')}
              >
                {scan.state === 'busy' ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons name="camera" size={22} color={colors.onPrimary} />}
                <Text style={styles.scanText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('form.scan')}</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => runScan(importDocument)} disabled={scan.state === 'busy'} accessibilityRole="button">
                <Text style={styles.secondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('form.import')}</Text>
              </Pressable>
              <Text style={scan.state === 'failed' ? styles.error : styles.hint} accessibilityLiveRegion="polite">
                {scan.state === 'busy'
                  ? t('form.scanning')
                  : scan.state === 'done'
                    ? t('form.scanned')
                    : scan.state === 'attached'
                      ? t('form.imported')
                      : scan.state === 'failed'
                      ? t('form.scanFailed', { detail: scan.detail })
                      : t('form.scanHint')}
              </Text>
            </View>
          )}
          {field('product_name', t('form.product'), { error: t('form.errProduct') })}
          {field('store_name', t('form.store'), { error: t('form.errStore') })}
          {field('purchase_date', t('form.purchaseDate'), { hint: t('form.dateHint'), error: t('form.errDate'), keyboard: 'numbers-and-punctuation', date: true })}

          <View style={styles.field}>
            <Text style={styles.label}>{t('form.length')}</Text>
            <View style={styles.chips}>
              {LENGTH_CHOICES.map((m) => {
                const selected = form.warranty_months === String(m);
                return (
                  <Pressable
                    key={m}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => set('warranty_months')(String(m))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{m}</Text>
                  </Pressable>
                );
              })}
              <TextInput
                style={[styles.input, styles.monthsInput, errors.includes('warranty_months') && styles.inputError]}
                value={form.warranty_months}
                onChangeText={set('warranty_months')}
                keyboardType="number-pad"
                maxLength={3}
                accessibilityLabel={t('form.length')}
              />
            </View>
            {errors.includes('warranty_months') && <Text style={styles.error}>{t('form.errMonths')}</Text>}
          </View>

          {accounts.length > 0 && (!existing || existing.origin === 'manual') && (
            <View style={styles.field}>
              <Text style={styles.label}>{t('form.saveTo')}</Text>
              <View style={styles.wrapChips}>
                {[null, ...accounts.map((a) => a.id)].map((aid) => {
                  const selected = accountId === aid;
                  return (
                    <Pressable
                      key={String(aid)}
                      style={[styles.chip, styles.chipWide, selected && styles.chipSelected]}
                      onPress={() => setAccountId(aid)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                        {aid === null ? t('home.tabManual') : accounts.find((a) => a.id === aid)!.email}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {existing?.store_domain && (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('form.remember', { store: existing.store_name })}</Text>
              <Switch value={remember} onValueChange={setRemember} accessibilityLabel={t('form.remember', { store: existing.store_name })} />
            </View>
          )}

          {!showMore ? (
            <Pressable style={styles.secondary} onPress={() => setMore(true)} accessibilityRole="button">
              <Text style={styles.secondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('form.more')}</Text>
            </Pressable>
          ) : (
            <>
          {field('warranty_start_date', t('form.startDate'), { hint: t('form.startHint'), error: t('form.errStart'), keyboard: 'numbers-and-punctuation', date: true })}
          <View style={styles.field}>
            <Text style={styles.label}>{t('form.coverage')}</Text>
            <View style={styles.wrapChips}>
              {([null, 'store', 'extended'] as const).map((c) => (
                <Pressable
                  key={String(c)}
                  style={[styles.chip, coverage === c && styles.chipSelected]}
                  onPress={() => setCoverage(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: coverage === c }}
                >
                  <Text style={[styles.chipText, coverage === c && styles.chipTextSelected]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t(`coverage.${c ?? 'standard'}`)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t('form.category')}</Text>
            <View style={styles.wrapChips}>
              {CATEGORIES.map((c) => {
                const selected = form.category === c;
                return (
                  <Pressable
                    key={c}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => set('category')(selected ? '' : c)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t(`category.${c}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.priceRow}>
            <View style={styles.flex}>{field('price', t('form.price'), { keyboard: 'decimal-pad' })}</View>
            <View style={styles.currency}>{field('currency', t('form.currency'), { keyboard: 'default' })}</View>
          </View>
          {field('order_number', t('form.orderNumber'))}
          {field('serial_number', t('form.serial'))}
          {field('contact_email', t('form.contactEmail'), { keyboard: 'email-address' })}
          {field('contact_phone', t('form.contactPhone'), { keyboard: 'phone-pad' })}
          {field('website_url', t('form.website'), { keyboard: 'url' })}
          {field('notes', t('form.notes'), { multiline: true })}
            </>
          )}

          <Pressable style={styles.button} onPress={save} accessibilityRole="button">
            <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('form.save')}</Text>
          </Pressable>
          {resolving && (
            <View style={styles.resolveRow}>
              <Pressable style={[styles.secondary, styles.flex]} onPress={goNext} accessibilityRole="button">
                <Text style={styles.secondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('form.later')}</Text>
              </Pressable>
              <Pressable style={[styles.secondary, styles.flex]} onPress={notWarranty} accessibilityRole="button">
                <Text style={styles.secondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('detail.notWarranty')}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  priceRow: { flexDirection: 'row', gap: 12 },
  currency: { width: 96 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16, paddingBottom: 48 },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: { minHeight: BUTTON_HEIGHT, borderWidth: 1, borderColor: colors.border, borderRadius: BUTTON_RADIUS, paddingHorizontal: 16, fontSize: 17, color: colors.text, backgroundColor: colors.surface },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  inputError: { borderColor: colors.soon.fg, borderWidth: 2 },
  hint: { fontSize: 14, color: colors.muted },
  error: { fontSize: 14, color: colors.soon.fg },
  chips: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: { minHeight: BUTTON_HEIGHT, minWidth: 56, borderRadius: BUTTON_RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 16, fontWeight: '600', color: colors.text },
  chipTextSelected: { color: colors.onPrimary },
  secondary: { minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
  mailBox: { maxHeight: 280, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, backgroundColor: colors.surface },
  mailText: { fontSize: 13, lineHeight: 19, color: colors.text },
  resolveRow: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  scanCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: BUTTON_HEIGHT, paddingHorizontal: 16, borderRadius: BUTTON_RADIUS, backgroundColor: colors.primary },
  scanPressed: { opacity: 0.8 },
  scanText: { fontSize: 17, fontWeight: '700', color: colors.onPrimary },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipWide: { paddingHorizontal: 14, maxWidth: '100%' },
  monthsInput: { flex: 1, minWidth: 0, textAlign: 'center' },
  dateInput: { justifyContent: 'center' },
  dateText: { fontSize: 17, color: colors.text },
  datePlaceholder: { color: colors.muted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  switchLabel: { flex: 1, fontSize: 15, color: colors.text },
  button: { minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_RADIUS, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontSize: 17, fontWeight: '700', color: colors.onPrimary },
});
