import { Pressable, Text, View } from '@/components/themeMotion';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { takeScannedSerial } from '@/serial';
import { goBack } from '@/nav';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type KeyboardTypeOptions } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import AppIcon from '@/components/Icon';
import { getDb } from '@/db/client';
import {
  addManualWithDocument, applyLengthToStore, getWarranty, ignoreWarranty, listAccounts, nextNeedsInput, saveStoreRule, sourceOf,
  storeItemsMissingLength, updateWarranty, type Account, type Warranty,
} from '@/db/repo.ts';
import { gmailTokenFor } from '@/google';
import { gmailProvider } from '@/mail/gmail.ts';
import { NavBar, Page } from '@/components/Page';
import { showAlert } from '@/components/Dialog';
import { Button, Group, Input, inputStyle, SectionHeader, Switch } from '@/components/ui';
import { colors, FIELD_RADIUS, pairWidth, ROW_X, TYPE, themed, useRoom } from '@/theme';
import { formatDate } from '@/components/WarrantyRow';
import { copyStoredDocument, deleteDocuments, importDocument, scanDocument } from '@/documents';
import { DocumentDraft } from '@/documentDraft';
import { SourceLoader, sourceKey, type SourceState } from '@/formSource';
import { discardInbox, getInboxItem } from '@/db/features.ts';
import { saveKnownText } from '@/docIndex';
import { whenUnlocked } from '@/lock/gate';
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
  const styles = useStyles();
  const room = useRoom();
  // copyFrom: "Add another warranty" for the same purchase (extended plan, store warranty).
  // inbox: a file waiting in the document inbox becomes this warranty's document.
  // scan: opened from the app icon's "Scan receipt" shortcut.
  const { id, copyFrom, inbox, scan: scanNow, more: moreParam } = useLocalSearchParams<{ id?: string; copyFrom?: string; inbox?: string; scan?: string; more?: string }>();
  const { t, i18n } = useTranslation();
  const [existing, setExisting] = useState<Warranty | null>(null);
  const [form, setForm] = useState<Form>(fromWarranty(null));
  const [errors, setErrors] = useState<FormField[]>([]);
  const [remember, setRemember] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null); // null = the Manual tab
  const [coverage, setCoverage] = useState<'store' | 'extended' | null>(null);
  const [scan, setScan] = useState<{ state: 'idle' | 'busy' | 'done' | 'attached' | 'failed'; detail?: string }>({ state: 'idle' });
  const draft = useRef(new DocumentDraft(deleteDocuments));
  const mounted = useRef(false);
  const savedId = useRef<number | null>(null);
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Edit and copy start from a stored warranty: the form stays hidden (and Save blocked) until that exact
  // record has loaded, so a missing or failed source can never turn into an accidental new warranty.
  const key = sourceKey(id, copyFrom);
  const [source, setSource] = useState<SourceState>({ key, status: key ? 'loading' : 'ready' });
  const [attempt, setAttempt] = useState(0); // Retry after a failed load
  const sourceReady = source.key === key && source.status === 'ready';
  const busy = isSaving || scan.state === 'busy' || !sourceReady;
  useEffect(() => {
    mounted.current = true;
    const current = new DocumentDraft(deleteDocuments);
    draft.current = current;
    return () => {
      mounted.current = false;
      current.dispose();
    };
  }, []);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [pickerError, setPickerError] = useState<string | null>(null); // the calendar failed: fall back to typing
  const [mail, setMail] = useState<{ state: 'hidden' | 'loading' | 'shown'; text?: string }>({ state: 'hidden' });
  const resolving = existing?.status === 'needs_input'; // section 9 resolve view
  // A new warranty asks only for the essentials; the rest opens on request, or by itself when there is
  // something in it to see (editing, a copied purchase, a scan, an error in the start date).
  const [more, setMore] = useState(!!moreParam);
  // A serial number read by the scanner screen (shortlist 11) comes back here.
  useFocusEffect(useCallback(() => {
    const serial = takeScannedSerial();
    if (serial) setForm((f) => ({ ...f, serial_number: serial }));
  }, []));
  const showMore = more || !!id || !!copyFrom || scan.state === 'done' || errors.includes('warranty_start_date');

  useEffect(() => {
    let cancelled = false;
    void getDb().then(listAccounts).then(
      (found) => { if (!cancelled) setAccounts(found); },
      (e) => { if (!cancelled) setSaveError(i18n.t('form.saveFailed', { detail: e instanceof Error ? e.message : String(e) })); },
    );
    return () => { cancelled = true; };
  }, [i18n]);

  useEffect(() => {
    savedId.current = null;
    const loader = new SourceLoader<Warranty>((state, w) => {
      setSource(state);
      if (!w) return setExisting(null);
      if (state.key?.startsWith('copy:')) {
        setForm({ ...fromWarranty(null), product_name: w.product_name ?? '', store_name: w.store_name, purchase_date: w.purchase_date,
          warranty_start_date: w.warranty_start_date, category: w.category ?? '', order_number: w.order_number ?? '', serial_number: w.serial_number ?? '' });
        setAccountId(w.account_id);
        setCoverage('extended');
        return;
      }
      savedId.current = w.id;
      setExisting(w);
      setForm(fromWarranty(w));
      setAccountId(w.account_id ?? null);
      setCoverage(w.coverage ?? null);
      // "Next" reuses this screen with a new id: start the item fresh.
      setErrors([]);
      setRemember(false);
      setMail({ state: 'hidden' });
    });
    void loader.load(key, async () => getWarranty(await getDb(), Number(id ?? copyFrom)));
    return () => loader.cancel();
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (inbox) {
      void getDb().then((db) => getInboxItem(db, Number(inbox))).then((item) => {
        // The inbox keeps its file until this warranty is saved; the form works on its own copy.
        if (item) void runScan(async () => ({ text: item.text, localPath: await copyStoredDocument(item.local_path) }));
      });
    } else if (scanNow && !id) void whenUnlocked().then(() => runScan(scanDocument)); // shortcut under the lock
  }, [inbox, scanNow]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (saving.current || draft.current.busy || !sourceReady) return;
    const found = formErrors(form);
    setErrors(found);
    if (found.length) {
      scroll.current?.scrollTo({ y: 0 }); // the required fields are at the top
      return;
    }
    saving.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      await persist();
    } catch (e) {
      if (mounted.current) setSaveError(t('form.saveFailed', { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      saving.current = false;
      if (mounted.current) setIsSaving(false);
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
    const saved = await draft.current.save(async (localPath) => {
      if (id && !savedId.current) throw new Error(t('form.missingTitle')); // never turn a lost edit into a new warranty
      if (savedId.current) await updateWarranty(db, savedId.current, input);
      else savedId.current = await addManualWithDocument(db, input, localPath);
    });
    if (saved && inbox) {
      const gone = await discardInbox(db, Number(inbox)); // its copy now belongs to this warranty
      if (gone) deleteDocuments([gone]);
    }
    if (!saved || !mounted.current) return;
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
      showAlert(t('attention.applyTitle', { months, count, store }), undefined, [
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
    if (saving.current || draft.current.busy) return;
    const current = draft.current;
    const previous = scan;
    setScan({ state: 'busy' });
    try {
      const result = await current.capture(source);
      if (!mounted.current) return;
      if (!result) return setScan(previous);
      void saveKnownText(result.localPath, result.text).catch(() => {}); // search reads it without OCR again
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
      if (mounted.current) setScan({ state: 'failed', detail: e instanceof Error ? e.message : String(e) });
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

  // Fields as in the reference's form panels: a label and a filled 44dp field, side by side when the column
  // has room (300 text-size-adjusted dp), otherwise the label above. Notes (multi-line) always take the width.
  const side = room(300);
  // Scan and Photo or PDF side by side while their words fit (the panel's padding is 2 × ROW_X)
  const stackMethods = !room(pairWidth(t('form.scanShort'), t('form.importShort'), 2 * ROW_X));
  const field = (key: keyof Form, label: string, opts: { hint?: string; error?: string; keyboard?: KeyboardTypeOptions; multiline?: boolean; date?: boolean } = {}) => {
    const invalid = errors.includes(key as FormField);
    if (opts.date && Platform.OS === 'android' && !pickerError) {
      const value = form[key];
      return (
        <View style={[styles.field, side && styles.fieldSide]}>
          <Text style={[styles.label, side && styles.labelSide]}>{label}</Text>
          <View style={side ? styles.controlSide : styles.control}>
          <Pressable
            testID={key}
            style={[inputStyle(), styles.dateInput, invalid && styles.inputError]}
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
        </View>
      );
    }
    const beside = side && !opts.multiline;
    return (
      <View style={[styles.field, beside && styles.fieldSide]}>
        <Text style={[styles.label, beside && styles.labelSide]} nativeID={`${key}-label`}>
          {label}
        </Text>
        <View style={beside ? styles.controlSide : styles.control}>
        <Input
          testID={key} // a stable handle for UI tests (Maestro)
          style={[opts.multiline && styles.multiline, invalid && styles.inputError]}
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
      </View>
    );
  };
  // A choice chip: --fill at rest, --tint-soft with tint-ink text when chosen (the reference's selected cell).
  const chip = (k: string, text: string, selected: boolean, onPress: () => void, wide = false) => (
    <Pressable
      key={k}
      style={({ pressed }) => [styles.chip, wide && styles.chipWide, selected && styles.chipSelected, pressed && styles.chipPressed]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={wide ? 1 : undefined}>
        {text}
      </Text>
    </Pressable>
  );

  const title = t(id ? 'form.titleEdit' : 'form.titleAdd');
  if (!sourceReady) {
    const status = source.key === key ? source.status : 'loading'; // the route just changed: its load starts now
    const failed = status === 'failed';
    return (
      <View style={[styles.screen, styles.sourceState]}>
        {status === 'loading' ? (
          <>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={styles.sourceText} accessibilityLiveRegion="polite">
              {t('form.loading')}
            </Text>
          </>
        ) : (
          <>
            <AppIcon name={failed ? 'alert-circle-outline' : 'document-outline'} size={40} color={colors.ink2} />
            <Text style={styles.sourceTitle} accessibilityRole="header">
              {t(failed ? 'form.loadFailedTitle' : 'form.missingTitle')}
            </Text>
            <Text style={styles.sourceText} accessibilityLiveRegion="polite">
              {failed ? t('form.loadFailedBody', { detail: source.error }) : t('form.missingBody')}
            </Text>
            {failed && <Button title={t('home.retry')} onPress={() => setAttempt((n) => n + 1)} style={styles.sourceButton} />}
            <Button kind={failed ? 'glass' : 'prominent'} title={t('form.backToList')} onPress={() => goBack()} style={styles.sourceButton} />
          </>
        )}
        <NavBar title={title} />
      </View>
    );
  }

  return (
    // Edge-to-edge Android does not resize the window for the keyboard, so pad on both platforms.
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <Page
        ref={scroll}
        title={title}
        // Save stays in reach at the bottom, above the keyboard when it is open.
        footer={
          <>
            {saveError && (
              <Text style={styles.saveError} accessibilityLiveRegion="polite">
                {saveError}
              </Text>
            )}
            <Button title={t(isSaving ? 'viewer.saving' : 'form.save')} onPress={save} disabled={busy && !isSaving} busy={isSaving} />
          </>
        }
      >
        {resolving && existing?.origin === 'gmail' && (
          <View style={styles.mail}>
            <Button kind="glass" title={t(mail.state === 'shown' ? 'form.hideEmail' : 'form.showEmail')} onPress={toggleMail} busy={mail.state === 'loading'} />
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
          <>
            <SectionHeader title={t('form.fromDocument')} first />
            <Group style={styles.panel}>
              <View style={[styles.methods, stackMethods && styles.methodsStacked]}>
                <Button title={t('form.scanShort')} icon="camera-outline" onPress={() => runScan(scanDocument)} disabled={busy && scan.state !== 'busy'} busy={scan.state === 'busy'} accessibilityLabel={t('form.scan')} style={!stackMethods && styles.flex} />
                <Button kind="glass" title={t('form.importShort')} icon="folder-open-outline" onPress={() => runScan(importDocument)} disabled={busy} accessibilityLabel={t('form.import')} style={!stackMethods && styles.flex} />
              </View>
              {scan.state === 'done' || scan.state === 'attached' ? (
                // Review before save: say plainly that the form was filled from the document.
                <View style={styles.review} accessibilityLiveRegion="polite">
                  <AppIcon name="checkmark-circle" size={20} color={colors.ok} />
                  <Text style={styles.reviewText}>{t(scan.state === 'done' ? 'form.scanned' : 'form.imported')}</Text>
                </View>
              ) : (
                <Text style={scan.state === 'failed' ? styles.error : styles.hint} accessibilityLiveRegion="polite">
                  {scan.state === 'busy' ? t('form.scanning') : scan.state === 'failed' ? t('form.scanFailed', { detail: scan.detail }) : t('form.scanHint')}
                </Text>
              )}
            </Group>
          </>
        )}
        <SectionHeader title={t('form.groupProduct')} first={!!existing} />
        <Group style={styles.panel}>
          {field('product_name', t('form.product'), { error: t('form.errProduct') })}
          {field('store_name', t('form.store'), { error: t('form.errStore') })}
        </Group>
        <SectionHeader title={t('form.groupWarranty')} />
        <Group style={styles.panel}>
          {field('purchase_date', t('form.purchaseDate'), { hint: t('form.dateHint'), error: t('form.errDate'), keyboard: 'numbers-and-punctuation', date: true })}

          <View style={styles.field}>
            <Text style={styles.label}>{t('form.length')}</Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {LENGTH_CHOICES.map((m) => chip(String(m), String(m), form.warranty_months === String(m), () => set('warranty_months')(String(m))))}
              <Input
                style={[styles.monthsInput, errors.includes('warranty_months') && styles.inputError]}
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
              <View style={styles.wrapChips} accessibilityRole="radiogroup">
                {[null, ...accounts.map((a) => a.id)].map((aid) =>
                  chip(String(aid), aid === null ? t('home.tabManual') : accounts.find((a) => a.id === aid)!.email, accountId === aid, () => setAccountId(aid), true),
                )}
              </View>
            </View>
          )}

          {existing?.store_domain && (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('form.remember', { store: existing.store_name })}</Text>
              <Switch value={remember} onValueChange={setRemember} accessibilityLabel={t('form.remember', { store: existing.store_name })} />
            </View>
          )}

          {!showMore ? (
            <Button kind="glass" title={t('form.more')} onPress={() => setMore(true)} style={styles.more} />
          ) : (
            <>
              {field('warranty_start_date', t('form.startDate'), { hint: t('form.startHint'), error: t('form.errStart'), keyboard: 'numbers-and-punctuation', date: true })}
              <View style={styles.field}>
                <Text style={styles.label}>{t('form.coverage')}</Text>
                <View style={styles.wrapChips} accessibilityRole="radiogroup">
                  {([null, 'store', 'extended'] as const).map((c) => chip(String(c), t(`coverage.${c ?? 'standard'}`), coverage === c, () => setCoverage(c)))}
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t('form.category')}</Text>
                <View style={styles.wrapChips} accessibilityRole="radiogroup">
                  {CATEGORIES.map((c) => chip(c, t(`category.${c}`), form.category === c, () => set('category')(form.category === c ? '' : c)))}
                </View>
              </View>
              <View style={styles.priceRow}>
                <View style={styles.flex}>{field('price', t('form.price'), { keyboard: 'decimal-pad' })}</View>
                <View style={styles.currency}>{field('currency', t('form.currency'), { keyboard: 'default' })}</View>
              </View>
              {field('order_number', t('form.orderNumber'))}
              {field('serial_number', t('form.serial'))}
              <Button kind="glass" icon="barcode-outline" title={t('serial.scan')} onPress={() => router.push('/scan-serial')} disabled={busy} />
              {field('contact_email', t('form.contactEmail'), { keyboard: 'email-address' })}
              {field('contact_phone', t('form.contactPhone'), { keyboard: 'phone-pad' })}
              {field('website_url', t('form.website'), { keyboard: 'url' })}
              {field('notes', t('form.notes'), { multiline: true })}
            </>
          )}
        </Group>

        {resolving && (
          <View style={styles.resolveRow}>
            <Button kind="glass" title={t('form.later')} onPress={goNext} style={styles.flex} />
            <Button kind="glass" title={t('detail.notWarranty')} onPress={notWarranty} style={styles.flex} />
          </View>
        )}
      </Page>
    </KeyboardAvoidingView>
  );
}

const useStyles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  sourceState: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  sourceTitle: { ...TYPE.title3, color: colors.ink, textAlign: 'center' },
  sourceText: { ...TYPE.body, color: colors.ink2, textAlign: 'center' },
  sourceButton: { alignSelf: 'stretch' },
  panel: { paddingTop: 4, paddingBottom: 16, paddingHorizontal: ROW_X, gap: 4 },
  field: { gap: 6, paddingTop: 8 },
  fieldSide: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  label: { ...TYPE.foot, color: colors.ink2 },
  labelSide: { ...TYPE.sub, color: colors.ink, width: '32%', paddingTop: 12 }, // centred on the 44dp field's first line
  control: { gap: 6 },
  controlSide: { flex: 1, minWidth: 0, gap: 6 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  inputError: { outlineWidth: 2, outlineColor: colors.bad, outlineStyle: 'solid' },
  hint: { ...TYPE.foot, color: colors.ink2 },
  error: { ...TYPE.foot, color: colors.bad },
  chips: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, minWidth: 48, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  chipWide: { maxWidth: '100%' },
  chipSelected: { backgroundColor: colors.tintSoft },
  chipPressed: { backgroundColor: colors.press },
  chipText: { ...TYPE.sub, fontWeight: '500', color: colors.ink },
  chipTextSelected: { color: colors.tintInk, fontWeight: '600' },
  monthsInput: { flex: 1, minWidth: 0, textAlign: 'center' },
  dateInput: { justifyContent: 'center' },
  dateText: { ...TYPE.body, color: colors.ink },
  datePlaceholder: { color: colors.ink2 },
  priceRow: { flexDirection: 'row', gap: 12 },
  currency: { width: 96 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingTop: 8 },
  switchLabel: { ...TYPE.body, flex: 1, color: colors.ink },
  more: { marginTop: 16 },
  mail: { gap: 12, marginTop: 8 },
  mailBox: { maxHeight: 280, borderRadius: FIELD_RADIUS, padding: 12, backgroundColor: colors.card },
  mailText: { ...TYPE.foot, color: colors.ink },
  methods: { flexDirection: 'row', gap: 8, paddingTop: 12, paddingBottom: 8 },
  methodsStacked: { flexDirection: 'column' },
  review: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: FIELD_RADIUS, backgroundColor: colors.okSoft },
  reviewText: { ...TYPE.sub, flex: 1, color: colors.ok },
  resolveRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  saveError: { ...TYPE.foot, color: colors.bad, paddingBottom: 8 },
}));
