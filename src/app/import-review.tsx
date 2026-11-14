import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from '@/components/themeMotion';
import { Page } from '@/components/Page';
import { Button, Group, Input, Row, SectionHeader, Switch } from '@/components/ui';
import { SheetBody, SheetFrame } from '@/components/Sheet';
import { useDatePicker } from '@/components/DatePicker';
import AppIcon from '@/components/Icon';
import { getDb } from '@/db/client';
import { getInboxItem, type InboxItem } from '@/db/features';
import { saveReviewedImport } from '@/db/importReview';
import { correctedChoices, formatSourceText, reviewDraft, reviewValid, sourceExcerpt, type ReviewDraft, type ReviewProduct } from '@/importReview';
import { forgetChoices, readChoices, rememberChoices } from '@/importChoices';
import { formatDate } from '@/components/WarrantyRow';
import { todayYmd } from '@/warranty';
import { colors, TYPE, themed } from '@/theme';
import { readImportDocument } from '@/documents';
import { cancelIndex } from '@/docIndex';

export default function ImportReview() {
  const { inbox } = useLocalSearchParams<{ inbox: string }>();
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const [item, setItem] = useState<InboxItem | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sourceModal, setSourceModal] = useState<{ value: string; label: string; mode: 'excerpt' | 'full' } | null>(null);
  const saving = useRef(false);
  const { pickDate, datePicker } = useDatePicker();
  useEffect(() => {
    let active = true;
    void getDb().then(db => getInboxItem(db, Number(inbox))).then(async found => {
      if (!active) return;
      if (!found) { setError(i18n.t('importReview.gone')); return; }
      if (!found.text.trim()) {
        try {
          cancelIndex(); // Give the foreground import priority over background document indexing.
          found.text = await readImportDocument(found.local_path, () => !active);
          if (!active) return;
          await (await getDb()).runAsync('UPDATE inbox SET text = ? WHERE id = ?', [found.text, found.id]);
        } catch { if (active) setError(i18n.t('importReview.readFailed')); }
      }
      if (!active) return;
      const initial = reviewDraft(found.text, todayYmd());
      setItem(found);
      setDraft(reviewDraft(found.text, todayYmd(), readChoices(initial.store)));
    }).catch(() => { if (active) setError(i18n.t('importReview.loadFailed')); });
    return () => { active = false; };
  }, [inbox, attempt, i18n]);
  const update = (index: number, patch: Partial<ReviewProduct>) => setDraft(d => d && ({ ...d, products: d.products.map((p, i) => i === index ? { ...p, ...patch } : p) }));
  function showSource(value: string, label: string) {
    setSourceModal({ value, label, mode: 'excerpt' });
  }
  async function save() {
    if (!draft || !item || saving.current || !reviewValid(draft)) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      await saveReviewedImport(await getDb(), item.id, draft);
      // Corrections are optional convenience. Failure here must never invite a second import.
      if (remember) { try { rememberChoices(reviewDraft(item.text, todayYmd()).store, correctedChoices(draft.products)); } catch { /* records already saved */ } }
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('importReview.saveFailed'));
      saving.current = false; setBusy(false);
    }
  }
  const count = draft?.products.filter(p => p.selected).length ?? 0;
  const sourceButton = (value: string, label: string) => (
    <Pressable
      onPress={() => showSource(value, label)}
      accessibilityRole="button"
      accessibilityLabel={`${t('importReview.source')}: ${label}`}
      style={styles.source}
    >
      <Text style={styles.link}>{t('importReview.source')}</Text>
    </Pressable>
  );
  return <>
    <Page title={t('importReview.title')} lead={t('importReview.lead')}
      footer={draft ? <Button title={t('importReview.save', { count })} onPress={() => void save()} busy={busy} disabled={!reviewValid(draft) || busy} /> : undefined}>
      {!draft ? <View style={styles.status}>{error ? <><Text style={styles.error}>{error}</Text><Button kind="glass" title={t('home.retry')} onPress={() => { setError(null); setAttempt(a => a + 1); }} /></> : <ActivityIndicator color={colors.ink2} />}</View> : <>
        <Button kind="glass" title={t('importReview.preview')} onPress={() => router.push({ pathname: '/document', params: { path: item!.local_path, title: item!.filename } })} />
        <SectionHeader title={t('importReview.purchase')} />
        <Group style={styles.group}>
          <View style={styles.field}><View style={styles.heading}><Text style={styles.label}>{t('form.store')}</Text>{sourceButton(draft.store, t('form.store'))}</View><Input accessibilityLabel={t('form.store')} value={draft.store} placeholder={t('importReview.required')} onChangeText={store => setDraft(d => d && ({ ...d, store }))} editable={!busy} /></View>
          <View style={styles.field}><View style={styles.heading}><Text style={styles.label}>{t('form.purchaseDate')}</Text>{sourceButton(draft.date, t('form.purchaseDate'))}</View><Button kind="glass" title={draft.date ? formatDate(draft.date, i18n.language) : t('importReview.chooseDate')} disabled={busy} onPress={() => pickDate({ title: t('form.purchaseDate'), value: draft.date || todayYmd(), onPick: date => setDraft(d => d && ({ ...d, date })) })} /></View>
          <View style={styles.field}><Text style={styles.label}>{t('form.orderNumber')}</Text><Input accessibilityLabel={t('form.orderNumber')} value={draft.order} onChangeText={order => setDraft(d => d && ({ ...d, order }))} editable={!busy} /></View>
        </Group>
        <SectionHeader title={t('importReview.products')} />
        {draft.products.map((product, index) => <Group key={index} style={styles.product}>
          <Row onPress={() => !busy && update(index, { selected: !product.selected })} accessibilityRole="checkbox" accessibilityState={{ checked: product.selected }} accessibilityLabel={product.name || t('importReview.product', { n: index + 1 })}>
            <AppIcon name={product.selected ? 'checkbox' : 'square-outline'} size={24} color={product.selected ? colors.tint : colors.ink2} />
            <Text style={styles.label}>{t('importReview.product', { n: index + 1 })}</Text>
          </Row>
          {product.selected && <View style={styles.productFields}>
            {product.remembered && <Text style={styles.hint}>{t('importReview.remembered')}</Text>}
            <View style={styles.heading}><Text style={styles.label}>{t('form.product')}</Text>{sourceButton(product.original, t('form.product'))}</View>
            <Input accessibilityLabel={`${t('form.product')} ${index + 1}`} value={product.name} placeholder={t('importReview.required')} onChangeText={name => update(index, { name })} editable={!busy} />
            <View style={styles.heading}><Text style={styles.label}>{t('importReview.months')}</Text>{sourceButton(product.original || product.months, t('importReview.months'))}</View>
            <Input accessibilityLabel={`${t('importReview.months')} ${index + 1}`} keyboardType="number-pad" value={product.months} placeholder={t('importReview.enterMonths')} onChangeText={months => update(index, { months })} editable={!busy} />
            {(!product.name.trim() || !/^(?:[1-9]|[1-9]\d|1[01]\d|120)$/.test(product.months)) && <Text style={styles.hint}>{t('importReview.checkMissing')}</Text>}
          </View>}
        </Group>)}
        <Button kind="glass" title={t('importReview.add')} disabled={busy || draft.products.length >= 100} onPress={() => setDraft(d => d && ({ ...d, products: [...d.products, { original: '', name: '', months: '', selected: true }] }))} />
        <Group style={styles.remember}><Text style={styles.flex}>{t('importReview.remember')}</Text><Switch value={remember} onValueChange={setRemember} disabled={busy} accessibilityLabel={t('importReview.remember')} /></Group>
        <Text style={styles.hint}>{t('importReview.local')}</Text>
        <Button kind="glass" title={t('importReview.forget')} disabled={busy} onPress={() => { forgetChoices(reviewDraft(item!.text, todayYmd()).store); setRemember(false); }} />
        {!reviewValid(draft) && <Text style={styles.hint}>{t('importReview.requiredHint')}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </>}
    </Page>
    <SheetFrame
      open={sourceModal !== null}
      onClose={() => setSourceModal(null)}
      title={`${t('importReview.source')}${sourceModal?.label ? ` · ${sourceModal.label}` : ''}`}
    >
      <SheetBody>
        {item?.text ? (
          <View style={styles.sourceContainer}>
            <View style={styles.segmented}>
              <Pressable
                onPress={() => setSourceModal(m => m && ({ ...m, mode: 'excerpt' }))}
                style={[styles.segment, sourceModal?.mode === 'excerpt' && styles.segmentActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: sourceModal?.mode === 'excerpt' }}
              >
                <Text style={[styles.segmentText, sourceModal?.mode === 'excerpt' && styles.segmentTextActive]}>
                  {t('importReview.excerpt')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSourceModal(m => m && ({ ...m, mode: 'full' }))}
                style={[styles.segment, sourceModal?.mode === 'full' && styles.segmentActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: sourceModal?.mode === 'full' }}
              >
                <Text style={[styles.segmentText, sourceModal?.mode === 'full' && styles.segmentTextActive]}>
                  {t('importReview.fullText')}
                </Text>
              </Pressable>
            </View>

            {sourceModal?.mode === 'excerpt' && sourceModal.value.trim() ? (
              <View style={styles.matchPill}>
                <AppIcon name="search-outline" size={14} color={colors.tint} />
                <Text style={styles.matchText} numberOfLines={1}>
                  {sourceModal.value.trim()}
                </Text>
              </View>
            ) : null}

            <View style={styles.readerCard}>
              <Text selectable style={styles.readerText}>
                {sourceModal?.mode === 'excerpt'
                  ? (sourceExcerpt(item.text, sourceModal.value) ?? formatSourceText(item.text))
                  : formatSourceText(item.text)}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.evidence}>{t('importReview.noText')}</Text>
        )}
      </SheetBody>
    </SheetFrame>
    {datePicker}
  </>;
}
const useStyles = themed(() => StyleSheet.create({
  group: { padding: 16, gap: 16 }, field: { gap: 6 }, heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { ...TYPE.body, color: colors.ink, flexShrink: 1 }, hint: { ...TYPE.foot, color: colors.ink2, marginVertical: 10 },
  source: { minHeight: 44, justifyContent: 'center' }, link: { ...TYPE.foot, color: colors.link }, product: { marginBottom: 12 },
  productFields: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 }, remember: { marginTop: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { ...TYPE.body, color: colors.ink, flex: 1 }, evidence: { ...TYPE.body, color: colors.ink, padding: 8 }, error: { ...TYPE.sub, color: colors.bad, marginVertical: 12 }, status: { padding: 20, gap: 12 },
  sourceContainer: { gap: 12, paddingBottom: 8 },
  segmented: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  segmentActive: { backgroundColor: colors.tintSoft },
  segmentText: { ...TYPE.foot, color: colors.ink2, fontWeight: '500' },
  segmentTextActive: { color: colors.tint, fontWeight: '600' },
  matchPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.tintSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, alignSelf: 'flex-start' },
  matchText: { ...TYPE.foot, color: colors.tint, fontWeight: '500' },
  readerCard: { backgroundColor: colors.card, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 16, minHeight: 120 },
  readerText: { ...TYPE.body, color: colors.ink, lineHeight: 22 },
}));
