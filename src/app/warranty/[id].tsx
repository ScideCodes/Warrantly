import { Pressable, Text, View } from '@/components/themeMotion';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppIcon from '@/components/Icon';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/nav';
import { ActivityIndicator, Image, Linking, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Field, Section } from '@/components/Section';
import { Sheet, type SheetSection } from '@/components/Sheet';
import { agoLabel, daysLabel, displayName, formatDate, formatMoney, lengthLabel, WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import {
  addAttachment, addHistory, deleteAttachment, setPhoto, deleteHistory, deleteWarranty, getWarranty, ignoreWarranty, listAttachments, listHistory, otherCovers,
  type Attachment, type HistoryEntry, type Warranty,
} from '@/db/repo.ts';
import { shareWarranties } from '@/dataTools';
import { deleteDocuments, documentExists, importDocument, openDocument, pickPhoto, saveDocument, scanDocument, sendClaim } from '@/documents';
import { DocumentDraft } from '@/documentDraft';
import { creditOf, lookUpPicture, removeFoundPicture } from '@/productImageLookup';
import { useProductPhoto } from '@/components/useProductPhoto';
import { claimEmail } from '@/claim';
import { sendTestReminder } from '@/reminders';
import { getUsername } from '@/settings';
import { Page } from '@/components/Page';
import { showAlert } from '@/components/Dialog';
import { Button, GlassButton, IconTile, Input, Row, TILE } from '@/components/ui';
import { colors, pairWidth, ROW_X, TONE, TYPE, themed, useRoom } from '@/theme';
import { daysUntil, returnDeadline, todayYmd, urgency } from '@/warranty';

type SheetKind = null | 'more' | 'add' | { doc: Attachment };

// Warranty detail (section 13). Order: what it is and how long it is covered, then its documents (the
// main reason to open it), then the purchase details, support and claims, and the history. Actions used
// rarely (share the record, another cover, test reminder, delete) live in the More sheet.
const NO_PHOTO = { photo_path: null, product_name: null, found_photo_key: null, found_photo_path: null };

export default function WarrantyDetail() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [w, setW] = useState<Warranty | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [docs, setDocs] = useState<Attachment[]>([]);
  const [others, setOthers] = useState<Warranty[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<SheetKind>(null);
  // View and Save side by side while their words fit (the document card's padding is 2 × 10)
  const stackActions = !useRoom()(pairWidth(t('detail.view'), t('detail.save'), 20));
  const operation = useRef(false);
  const mounted = useRef(false);
  const draft = useRef(new DocumentDraft(deleteDocuments));
  const [documentBusy, setDocumentBusy] = useState<number | 'attach' | 'share' | null>(null);
  useEffect(() => {
    mounted.current = true;
    const current = new DocumentDraft(deleteDocuments);
    draft.current = current;
    return () => { mounted.current = false; draft.current.dispose(); };
  }, []);
  // Reload on focus so changes made in the edit screen show up.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getDb().then(async (db) => {
        const [found, attachments, entries] = await Promise.all([
          getWarranty(db, Number(id)), listAttachments(db, Number(id)), listHistory(db, Number(id)),
        ]);
        if (!active) return;
        setW(found);
        setDocs(attachments);
        setHistory(entries);
        setLoadError(null);
        setLoading(false);
        // Related covers must not hold up the documents the user came to open.
        const related = found ? await otherCovers(db, found) : [];
        if (active) setOthers(related);
      }).catch((e) => {
        if (active) { setLoadError(e instanceof Error ? e.message : String(e)); setLoading(false); }
      });
      return () => { active = false; };
    // loadAttempt deliberately restarts the focused loader when Retry is tapped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, loadAttempt]),
  );

  // Hooks run before the loading return: the picture falls back (user photo, found picture, camera tile).
  const photo = useProductPhoto(w ?? NO_PHOTO);

  if (!w)
    return (
      <Page title={t(loading ? 'form.loading' : loadError ? 'form.loadFailedTitle' : 'form.missingTitle')}>
        {loading ? <ActivityIndicator color={colors.tint} /> : (
          <View style={{ gap: 16 }}>
            <Text style={{ ...TYPE.body, color: colors.ink2 }}>{t(loadError ? 'form.loadFailedBody' : 'form.missingBody', { detail: loadError })}</Text>
            {loadError && <Button title={t('home.retry')} onPress={() => { setLoading(true); setLoadAttempt((n) => n + 1); }} />}
            <Button title={t('form.backToList')} kind="glass" onPress={() => router.replace('/')} />
          </View>
        )}
      </Page>
    );

  const today = todayYmd();
  const days = daysUntil(w.end_date, today);
  const tone = TONE[urgency(days)];
  const date = (ymd: string) => formatDate(ymd, i18n.language);
  const suggested = (value: string, isSuggested: number) => (isSuggested ? t('warranty.suggested', { value }) : value);
  const product = displayName(t, w);
  const credit = photo?.found ? creditOf(w) : null;

  function confirmRemoveDocument(d: Attachment) {
    showAlert(t('detail.removeDocumentTitle'), t('detail.deleteBody'), [
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

  const viewDocument = (d: Attachment) =>
    documentExists(d.local_path) ? router.push({ pathname: '/document', params: { path: d.local_path, title: product, name: d.filename } }) : showAlert(t('detail.documentMissing'));

  // Save asks Android where to put the copy; backing out of the folder picker is not an error.
  async function save(d: Attachment) {
    if (operation.current) return;
    operation.current = true;
    setDocumentBusy(d.id);
    try {
      if (!documentExists(d.local_path)) return showAlert(t('detail.documentMissing'));
      if (await saveDocument(d.local_path, d.filename) && mounted.current) showAlert(t('detail.saved'));
    } catch (e) {
      if (mounted.current) showAlert(t('detail.saveFailed', { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      operation.current = false;
      if (mounted.current) setDocumentBusy(null);
    }
  }

  async function share(d: Attachment) {
    if (operation.current) return;
    operation.current = true;
    setDocumentBusy('share');
    try {
      if (!documentExists(d.local_path)) return showAlert(t('detail.documentMissing'));
      await openDocument(d.local_path);
    } catch (e) {
      if (mounted.current) showAlert(t('detail.shareFailed', { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      operation.current = false;
      if (mounted.current) setDocumentBusy(null);
    }
  }

  // Any warranty can get a document later (scanned, or a photo or PDF from the phone), e.g. the paper
  // invoice of a mail-imported purchase.
  async function attach(source: typeof scanDocument) {
    if (operation.current) return;
    operation.current = true;
    setDocumentBusy('attach');
    const current = draft.current;
    try {
      const result = await current.capture(source);
      if (!result) return;
      const db = await getDb();
      const saved = await current.save(async (path) => {
        await addAttachment(db, w!.id, docs.length ? `${product} (${docs.length + 1}).pdf` : `${product}.pdf`, path!);
      });
      if (saved && mounted.current) setDocs(await listAttachments(db, w!.id));
    } catch (e) {
      current.dispose();
      draft.current = new DocumentDraft(deleteDocuments);
      if (mounted.current) showAlert(t('form.scanFailed', { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      operation.current = false;
      if (mounted.current) setDocumentBusy(null);
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
    showAlert(t('detail.deleteNote'), h.note, [
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

  // Product photo: camera or gallery; a new one replaces the old file.
  function choosePhoto() {
    const take = async (source: 'camera' | 'library' | null) => {
      try {
        const picked = source ? await pickPhoto(source) : null;
        if (source && !picked) return;
        const db = await getDb();
        const old = await setPhoto(db, w!.id, picked);
        if (old) deleteDocuments([old]);
        setW(await getWarranty(db, w!.id));
      } catch (e) {
        showAlert(e instanceof Error ? e.message : String(e));
      }
    };
    showAlert(t('detail.photo'), undefined, [
      { text: t('detail.cancel'), style: 'cancel' },
      ...(w!.photo_path ? [{ text: t('detail.photoRemove'), style: 'destructive' as const, onPress: () => void take(null) }] : []),
      ...(photo?.found ? [{ text: t('detail.pictureRemove'), style: 'destructive' as const, onPress: () => void dropFound() }] : []),
      ...(!w!.photo_path && !photo?.found && w!.product_name ? [{ text: t('detail.pictureFind'), onPress: () => void findOnline() }] : []),
      { text: t('detail.photoLibrary'), onPress: () => void take('library') },
      { text: t('detail.photoCamera'), onPress: () => void take('camera') },
    ]);
  }

  // Explicit, one-off lookup of a picture for this product name (also when automatic pictures are off).
  async function findOnline() {
    setPictureBusy(true);
    try {
      const db = await getDb();
      const found = await lookUpPicture(db, w!);
      setW(await getWarranty(db, w!.id));
      if (!found) showAlert(t('detail.pictureNone'));
    } catch {
      showAlert(t('detail.pictureFailed'));
    } finally {
      setPictureBusy(false);
    }
  }

  async function dropFound() {
    const db = await getDb();
    await removeFoundPicture(db, w!);
    setW(await getWarranty(db, w!.id));
  }

  async function notWarranty() {
    await ignoreWarranty(await getDb(), w!.id);
    goBack();
  }

  function confirmDelete() {
    showAlert(t('detail.deleteTitle', { product }), t('detail.deleteBody'), [
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

  function claim() {
    const { subject, body } = claimEmail(t, {
      product: w!.product_name ?? t('warranty.unknownProduct'),
      purchaseDate: date(w!.purchase_date),
      endDate: date(w!.end_date),
      orderNumber: w!.order_number,
      serialNumber: w!.serial_number,
      name: getUsername(),
    });
    sendClaim(w!.contact_email!, subject, body, docs.map((d) => d.local_path)).catch(() => showAlert(t('detail.noMailApp')));
  }

  const sheets: Record<'more' | 'add', { title: string; sections: SheetSection[] }> = {
    add: {
      title: t('detail.addDocument'),
      sections: [
        {
          options: [
            { key: 'scan', icon: 'camera-outline', label: t('detail.attachScan'), onPress: () => void attach(scanDocument) },
            { key: 'import', icon: 'folder-open-outline', label: t('detail.attachImport'), onPress: () => void attach(importDocument) },
          ],
        },
      ],
    },
    more: {
      title: t('detail.more'),
      sections: [
        {
          options: [
            {
              key: 'share',
              icon: 'share-outline',
              label: t('detail.shareRecord'),
              onPress: () => void getDb().then((db) => shareWarranties(db, [w.id], `warrantly-${product.replace(/[^\w-]+/g, '-')}.json`)).catch((e) => showAlert(String(e))),
            },
            { key: 'cover', icon: 'add-circle-outline', label: t('detail.addCover'), onPress: () => router.push({ pathname: '/warranty/edit', params: { copyFrom: String(w.id) } }) },
            {
              key: 'test',
              icon: 'notifications-outline',
              label: t('detail.testReminder'),
              onPress: async () => {
                if (!(await sendTestReminder(w, days))) showAlert(t('detail.noPermission'));
              },
            },
            ...(w.status === 'needs_input' ? [{ key: 'ignore', icon: 'eye-off-outline' as const, label: t('detail.notWarranty'), onPress: () => void notWarranty() }] : []),
            // Any warranty can be deleted (owner's choice, wider than section 10); a deleted mail warranty
            // keeps its source marker, so sync never brings it back.
            { key: 'delete', icon: 'trash-outline', label: t('detail.delete'), destructive: true, onPress: confirmDelete },
          ],
        },
      ],
    },
  };
  const selectedDoc = typeof sheet === 'object' && sheet ? sheet.doc : null;
  const docSheet: { title: string; sections: SheetSection[] } | null = selectedDoc ? {
    title: selectedDoc.filename,
    sections: [
      {
        options: [
          { key: 'share', icon: 'share-social-outline', label: t('detail.shareFile'), onPress: () => { void share(selectedDoc); } },
          { key: 'remove', icon: 'trash-outline', label: t('detail.removeDocument'), destructive: true, onPress: () => confirmRemoveDocument(selectedDoc) },
        ],
      },
    ],
  } : null;
  const openSheet = sheet === null ? null : sheet === 'more' || sheet === 'add' ? sheets[sheet] : docSheet;
  const returnBy = returnDeadline(w);
  const details = [
    { label: t('warranty.purchaseDate'), value: `${date(w.purchase_date)} (${agoLabel(t, w.purchase_date, today)})` },
    { label: t('warranty.startDate'), value: suggested(date(w.warranty_start_date), w.start_is_suggested) },
    w.coverage && { label: t('form.coverage'), value: t(`coverage.${w.coverage}`) },
    { label: t('warranty.length'), value: lengthLabel(t, w) },
    { label: t('warranty.endDate'), value: date(w.end_date) },
    returnBy && returnBy >= today && { label: t('detail.returnBy'), value: `${date(returnBy)} (${t('detail.returnHint')})` },
    w.price !== null && w.currency && { label: t('form.price'), value: formatMoney(w.price, w.currency, i18n.language) },
    w.category && { label: t('form.category'), value: t(`category.${w.category}`) },
    w.order_number && { label: t('warranty.orderNumber'), value: w.order_number },
    w.serial_number && { label: t('detail.serial'), value: w.serial_number },
    w.notes && { label: t('detail.notes'), value: w.notes },
  ].filter((f): f is { label: string; value: string } => !!f);
  const contacts = [
    w.contact_email && { label: t('warranty.contact'), value: w.contact_email, url: `mailto:${w.contact_email}` },
    w.contact_phone && { label: t('warranty.contact'), value: w.contact_phone, url: `tel:${w.contact_phone.replace(/[^\d+]/g, '')}` },
    w.website_url && { label: t('warranty.website'), value: w.website_url.replace(/^https:\/\//, ''), url: w.website_url },
  ].filter((f): f is { label: string; value: string; url: string } => !!f);

  return (
    <>
      <Page
        title={w.product_name ?? product}
        trailing={
          <>
            <GlassButton icon="create-outline" label={t('detail.edit')} onPress={() => router.push({ pathname: '/warranty/edit', params: { id: String(w.id) } })} />
            <GlassButton icon="ellipsis-horizontal" label={t('detail.more')} onPress={() => setSheet('more')} />
          </>
        }
        head={
          // 1. What it is, and how long it is covered: the reference's detail hero (56dp tile, Title 2, Subheadline).
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <Pressable onPress={choosePhoto} accessibilityRole="button" accessibilityLabel={t('detail.photo')}>
                {pictureBusy ? (
                  <View style={[styles.photo, styles.photoEmpty]}>
                    <ActivityIndicator color={colors.tint} />
                  </View>
                ) : photo ? (
                  <Image source={{ uri: photo.uri }} onError={photo.onError} style={styles.photo} accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[styles.photo, styles.photoEmpty]}>
                    <AppIcon name="camera-outline" size={28} color={colors.tint} />
                  </View>
                )}
              </Pressable>
              <View style={styles.flex}>
                <Text style={styles.title} accessibilityRole="header">
                  {w.product_name ?? product}
                </Text>
                <Text style={styles.store}>{w.store_name}</Text>
              </View>
            </View>
            <View style={styles.status}>
              <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.badgeText, { color: tone.fg }]}>{daysLabel(t, days)}</Text>
              </View>
              <Text style={styles.store}>{t(days < 0 ? 'warranty.endedOn' : 'warranty.endsOn', { date: date(w.end_date) })}</Text>
            </View>
            {w.status === 'needs_input' && <Text style={styles.note}>{t('warranty.needsInput')}</Text>}
            {credit && (
              // The licence asks for the author and licence with the picture; the file page has the details.
              <Pressable onPress={() => void Linking.openURL(credit.page)} accessibilityRole="link" hitSlop={8}>
                <Text style={styles.credit} numberOfLines={2}>
                  {t('detail.pictureCredit', { artist: credit.artist, license: credit.license })}
                </Text>
              </Pressable>
            )}
          </View>
        }
      >
        {/* 2. Documents: right under the summary, one row each with View and Save. */}
        <Section title={t('detail.documents')}>
          {docs.length === 0 && <Text style={styles.empty}>{t('detail.noDocuments')}</Text>}
          {docs.map((d, i) => {
            const missing = !documentExists(d.local_path);
            return (
              <View key={d.id} style={styles.doc}>
                {i > 0 && <View style={styles.line} />}
                <View style={styles.docTop}>
                  <IconTile name={missing ? 'alert-circle-outline' : 'document-text-outline'} color={missing ? TILE.grey : TILE.red} />
                  <View style={styles.flex}>
                    <Text style={styles.docName}>{d.filename}</Text>
                    <Text style={[styles.docType, missing && styles.docMissing]}>{missing ? t('detail.fileMissing') : t('detail.pdf')}</Text>
                  </View>
                  <Pressable style={({ pressed }) => [styles.round, pressed && styles.roundPressed]} onPress={() => setSheet({ doc: d })} accessibilityRole="button" accessibilityLabel={t('detail.documentOptions', { name: d.filename })}>
                    <AppIcon name="ellipsis-horizontal" size={20} color={colors.ink} />
                  </Pressable>
                </View>
                {!missing && (
                  <View style={[styles.docActions, stackActions && styles.stacked]}>
                    <Button title={t('detail.view')} icon="eye-outline" onPress={() => viewDocument(d)} accessibilityLabel={`${t('detail.view')}: ${d.filename}`} style={!stackActions && styles.docButton} />
                    <Button
                      kind="glass"
                      title={t(documentBusy === d.id ? 'viewer.saving' : 'detail.save')}
                      icon="download-outline"
                      onPress={() => void save(d)}
                      disabled={documentBusy !== null && documentBusy !== d.id}
                      busy={documentBusy === d.id}
                      accessibilityLabel={`${t('detail.save')}: ${d.filename}`}
                      style={!stackActions && styles.docButton}
                    />
                  </View>
                )}
              </View>
            );
          })}
          <Row separator={docs.length > 0} iconInset onPress={() => setSheet('add')} disabled={documentBusy !== null} accessibilityState={{ busy: documentBusy === 'attach' }}>
            <View style={styles.glyph}>{documentBusy === 'attach' ? <ActivityIndicator color={colors.tint} /> : <AppIcon name="add-circle-outline" size={22} color={colors.tint} />}</View>
            <Text style={styles.addText}>{t(documentBusy === 'attach' ? 'form.scanning' : 'detail.addDocument')}</Text>
          </Row>
        </Section>

        {/* 3. Purchase and coverage details. */}
        <Section title={t('detail.details')}>
          {details.map((f, i) => (
            <Field key={f.label} label={f.label} value={f.value} last={i === details.length - 1} />
          ))}
        </Section>

        {others.length > 0 && (
          <Section title={t('detail.otherCovers')}>
            {others.map((o, i) => (
              <WarrantyRow key={o.id} warranty={o} separator={i > 0} />
            ))}
          </Section>
        )}

        {/* 4. Support and claims. */}
        <Section title={t('detail.support')}>
          {days >= 0 &&
            // Section 20: not offered once the warranty has expired.
            (w.contact_email ? (
              <View style={styles.claim}>
                <Button title={t('detail.claim')} icon="mail-outline" onPress={claim} />
              </View>
            ) : (
              <Text style={styles.empty}>{t('detail.claimNoEmail')}</Text>
            ))}
          {contacts.map((c, i) => (
            <Field key={c.url} label={c.label} value={c.value} onPress={() => void Linking.openURL(c.url)} last={!brand && i === contacts.length - 1} />
          ))}
          {brand && (
            <Field
              label={t('detail.supportSearch')}
              value={t('detail.brandSupport', { brand })}
              onPress={() => void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(`${brand} ${t('detail.supportQuery')}`)}`)}
              last
            />
          )}
        </Section>

        {/* 5. History and notes. */}
        <Section title={t('detail.history')}>
          {history.map((h, i) => (
            <Row key={h.id} separator={i > 0} style={styles.noteItem}>
              <Text style={[styles.noteText, styles.flex]}>
                {date(h.date)}: {h.note}
              </Text>
              {/* A visible button, not a long-press: hidden gestures are hard to discover. */}
              <Pressable style={({ pressed }) => [styles.round, pressed && styles.roundPressed]} onPress={() => confirmDeleteNote(h)} accessibilityRole="button" accessibilityLabel={`${t('detail.delete')}: ${h.note}`}>
                <AppIcon name="trash-outline" size={20} color={colors.bad} />
              </Pressable>
            </Row>
          ))}
          <View style={[styles.noteRow, history.length > 0 && styles.noteRowLine]}>
            <Input style={styles.noteInput} value={note} onChangeText={setNote} placeholder={t('detail.notePlaceholder')} accessibilityLabel={t('detail.history')} onSubmitEditing={addNote} />
            <Button kind="glass" title={t('detail.addNote')} onPress={addNote} />
          </View>
        </Section>
      </Page>
      <Sheet open={openSheet !== null} onClose={() => setSheet(null)} title={openSheet?.title ?? ''} sections={openSheet?.sections ?? []} />
    </>
  );
}

const useStyles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  hero: { gap: 10, paddingTop: 4, paddingHorizontal: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 52, height: 52, borderRadius: 13 },
  photoEmpty: { backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  title: { ...TYPE.title2, color: colors.ink },
  store: { ...TYPE.sub, color: colors.ink2 },
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  badge: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { ...TYPE.foot, fontWeight: '600' },
  note: { ...TYPE.sub, color: colors.warn },
  credit: { ...TYPE.foot, color: colors.ink2 },
  empty: { ...TYPE.sub, color: colors.ink2, paddingVertical: 12, paddingHorizontal: ROW_X },
  doc: { paddingVertical: 10, paddingHorizontal: ROW_X, gap: 10 },
  line: { position: 'absolute', top: 0, left: ROW_X, right: ROW_X, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  docTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docName: { ...TYPE.body, color: colors.ink },
  docType: { ...TYPE.foot, color: colors.ink2 },
  docMissing: { color: colors.bad },
  docActions: { flexDirection: 'row', gap: 8 },
  docButton: { flex: 1, minWidth: 0 },
  stacked: { flexDirection: 'column' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  roundPressed: { backgroundColor: colors.press, transform: [{ scale: 0.94 }] },
  glyph: { width: 29, alignItems: 'center' },
  addText: { ...TYPE.body, flex: 1, color: colors.link },
  claim: { paddingVertical: 12, paddingHorizontal: ROW_X },
  noteItem: { paddingVertical: 4 },
  noteText: { ...TYPE.body, color: colors.ink },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: ROW_X },
  noteRowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginHorizontal: ROW_X, paddingHorizontal: 0 },
  noteInput: { flex: 1, minWidth: 0 },
}));
