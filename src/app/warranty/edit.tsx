import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getDb } from '@/db/client';
import { addManual, getWarranty, saveStoreRule, updateWarranty, type Warranty } from '@/db/repo.ts';
import { colors } from '@/theme';
import { formErrors, todayYmd, type FormField } from '@/warranty';

const LENGTH_CHOICES = [12, 24, 36];
type Form = Record<FormField | 'order_number' | 'serial_number' | 'contact_email' | 'contact_phone' | 'website_url' | 'notes', string>;

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
});

// Manual add, and edit of any warranty (section 9 resolve view, section 18 manual add).
// shortcut: dates are typed as YYYY-MM-DD; switch to a native date picker at the next native build.
export default function EditWarranty() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const [existing, setExisting] = useState<Warranty | null>(null);
  const [form, setForm] = useState<Form>(fromWarranty(null));
  const [errors, setErrors] = useState<FormField[]>([]);
  const [remember, setRemember] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (!id) return;
    void getDb()
      .then((db) => getWarranty(db, Number(id)))
      .then((w) => {
        setExisting(w);
        setForm(fromWarranty(w));
      });
  }, [id]);

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    const found = formErrors(form);
    setErrors(found);
    if (found.length) {
      scroll.current?.scrollTo({ y: 0 }); // the required fields are at the top
      return;
    }
    const opt = (s: string) => s.trim() || null;
    const input = {
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
    };
    const db = await getDb();
    if (existing) await updateWarranty(db, existing.id, input);
    else await addManual(db, input);
    if (remember && existing?.store_domain) await saveStoreRule(db, existing.store_domain, input.warranty_months);
    router.back();
  }

  const field = (key: keyof Form, label: string, opts: { hint?: string; error?: string; keyboard?: KeyboardTypeOptions; multiline?: boolean } = {}) => {
    const invalid = errors.includes(key as FormField);
    return (
      <View style={styles.field}>
        <Text style={styles.label} nativeID={`${key}-label`}>
          {label}
        </Text>
        <TextInput
          style={[styles.input, opts.multiline && styles.multiline, invalid && styles.inputError]}
          value={form[key]}
          onChangeText={set(key)}
          keyboardType={opts.keyboard}
          multiline={opts.multiline}
          autoCapitalize={opts.keyboard ? 'none' : 'sentences'}
          accessibilityLabelledBy={`${key}-label`}
          accessibilityHint={opts.hint}
        />
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
          {field('product_name', t('form.product'), { error: t('form.errProduct') })}
          {field('store_name', t('form.store'), { error: t('form.errStore') })}
          {field('purchase_date', t('form.purchaseDate'), { hint: t('form.dateHint'), error: t('form.errDate'), keyboard: 'numbers-and-punctuation' })}
          {field('warranty_start_date', t('form.startDate'), { hint: t('form.startHint'), error: t('form.errStart'), keyboard: 'numbers-and-punctuation' })}

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
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{m}</Text>
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

          {existing?.store_domain && (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('form.remember', { store: existing.store_name })}</Text>
              <Switch value={remember} onValueChange={setRemember} accessibilityLabel={t('form.remember', { store: existing.store_name })} />
            </View>
          )}

          {field('order_number', t('form.orderNumber'))}
          {field('serial_number', t('form.serial'))}
          {field('contact_email', t('form.contactEmail'), { keyboard: 'email-address' })}
          {field('contact_phone', t('form.contactPhone'), { keyboard: 'phone-pad' })}
          {field('website_url', t('form.website'), { keyboard: 'url' })}
          {field('notes', t('form.notes'), { multiline: true })}

          <Pressable style={styles.button} onPress={save} accessibilityRole="button">
            <Text style={styles.buttonText}>{t('form.save')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16, paddingBottom: 48 },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, fontSize: 16, color: colors.text },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  inputError: { borderColor: colors.soon.fg, borderWidth: 2 },
  hint: { fontSize: 13, color: colors.muted },
  error: { fontSize: 13, color: colors.soon.fg },
  chips: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: { minHeight: 48, minWidth: 56, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 16, fontWeight: '600', color: colors.text },
  chipTextSelected: { color: colors.onPrimary },
  monthsInput: { flex: 1, minWidth: 0, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  switchLabel: { flex: 1, fontSize: 15, color: colors.text },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
});
