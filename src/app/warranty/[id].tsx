import { dismissMissingDetails } from '@/db/productTools';
import { serialEntries } from '@/serialNumbers';
import { Pressable, Text, View } from '@/components/themeMotion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import AppIcon, { ProductIcon } from '@/components/Icon';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/nav';
import { mailUrl, telUrl, webUrl } from '@/safeLinks';
import { ActivityIndicator, Animated, FlatList, Image, Linking, Platform, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Field, Section } from '@/components/Section';
import { Sheet, SheetFrame, type SheetSection } from '@/components/Sheet';
import { agoLabel, CATEGORY_TILE, daysLabel, displayName, formatDate, formatMoney, lengthLabel, WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import {
  addAttachment, addHistory, DOC_LABELS, setAttachmentLabel, setPhoto, deleteHistory, getWarranty, ignoreWarranty, listAttachments, listHistory, listWarranties, otherCovers,
  type Attachment, type DocLabel, type HistoryEntry, type Warranty,
} from '@/db/repo.ts';
import {
  addClaim, addCustomReminder, bundleMembers, bundleTogether, CLAIM_STATUSES, collectionsOf, deleteClaim, deleteCustomReminder, leaveBundle, listClaims, listCollections,
  listCustomReminders, setArchived, setFavorite, setMembership, shareDocument, softDeleteAttachment, softDeleteWarranties, undoDeleteAttachment, undoDeleteWarranties, updateClaim,
  type Claim, type ClaimStatus, type Collection, type CustomReminder,
} from '@/db/features.ts';
import { useDatePicker } from '@/components/DatePicker';
import { DocThumb } from '@/components/DocThumb';
import { completeness, type Issue } from '@/completeness';
import { daysUntil, productIcon, returnDeadline, todayYmd, urgency } from '@/warranty';
import { setBundleLead } from '@/settings';
import { WarrantyDetailSkeleton } from '@/components/Skeleton';
import { saveKnownText } from '@/docIndex';
import { recordWarranty } from '@/recentStore';
import { purgeBefore, showUndo } from '@/undo';
import { shareWarranties } from '@/dataTools';
import { deleteDocuments, documentExists, importDocument, openDocument, pickPhoto, saveDocument, scanDocument } from '@/documents';
import { DocumentDraft } from '@/documentDraft';
import { useProductPhoto } from '@/components/useProductPhoto';
import { rescheduleReminders, sendTestReminder } from '@/reminders';
import { Page } from '@/components/Page';
import { showAlert } from '@/components/Dialog';
import { Button, GlassButton, Input, reduceMotion, Row, TILE } from '@/components/ui';
import { colors, pairWidth, RADIUS, ROW_X, TONE, TYPE, themed, useRoom } from '@/theme';

type SheetKind = null | 'more' | 'add' | 'collections' | 'bundle' | { doc: Attachment } | { label: Attachment } | { claim: Claim };


// Warranty detail (section 13). Order: what it is and how long it is covered, then its documents (the
// main reason to open it), then the purchase details, support and claims, and the history. Actions used
// rarely (share the record, another cover, test reminder, delete) live in the More sheet.
const NO_PHOTO = { photo_path: null };

export default function WarrantyDetail() {
  const styles = useStyles();
  const { id, attach: attachParam } = useLocalSearchParams<{ id: string; attach?: string }>();
  const { t, i18n } = useTranslation();
  const [w, setW] = useState<Warranty | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [docs, setDocs] = useState<Attachment[]>([]);
  const [others, setOthers] = useState<Warranty[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [note, setNote] = useState('');
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimTitle, setClaimTitle] = useState('');
  const [reminders, setReminders] = useState<CustomReminder[]>([]);
  const [reminderNote, setReminderNote] = useState('');
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [mine, setMine] = useState<number[]>([]);
  const [bundle, setBundle] = useState<Warranty[]>([]);
  const [candidates, setCandidates] = useState<Warranty[]>([]);
  const [selectedBundleIds, setSelectedBundleIds] = useState<Set<number>>(new Set());
  const toggleCandidate = useCallback((cid: number) => {
    setSelectedBundleIds((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }, []);
  const [floatAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const hasSelection = selectedBundleIds.size > 0;
    if (reduceMotion()) {
      floatAnim.setValue(hasSelection ? 1 : 0);
      return;
    }
    Animated.spring(floatAnim, {
      toValue: hasSelection ? 1 : 0,
      stiffness: 450,
      damping: 28,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [selectedBundleIds.size, floatAnim]);
  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [50, 0] });
  const floatOpacity = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  // From the row's document button with no document yet: the add sheet is open on arrival.
  const { pickDate, datePicker } = useDatePicker();
  const [sheet, setSheet] = useState<SheetKind>(attachParam ? 'add' : null);
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
        const n = Number(id);
        const [found, attachments, entries, cl, rem, cols, inCols] = await Promise.all([
          getWarranty(db, n), listAttachments(db, n), listHistory(db, n), listClaims(db, n), listCustomReminders(db, n), listCollections(db), collectionsOf(db, n),
        ]);
        if (!active) return;
        setW(found);
        setDocs(attachments);
        setHistory(entries);
        setClaims(cl);
        setReminders(rem);
        setAllCollections(cols);
        setMine(inCols);
        if (found) recordWarranty(found.id); // shortlist 22
        const members = found?.bundle_id ? (await bundleMembers(db, found.bundle_id)).filter((m) => m.id !== found.id) : [];
        if (active) setBundle(members);
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

  // Hooks run before the loading return: the photo falls back to the camera tile.
  const photo = useProductPhoto(w ?? NO_PHOTO);

  if (!w)
    return (
      <Page title={loading ? '' : t(loadError ? 'form.loadFailedTitle' : 'form.missingTitle')}>
        {loading ? <WarrantyDetailSkeleton /> : (
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

  // Shortlist 9: removed at once, with Undo for a few seconds; the file goes only when nothing else uses it.
  async function removeDocument(d: Attachment) {
    const db = await getDb();
    await softDeleteAttachment(db, d.id);
    setDocs(await listAttachments(db, w!.id));
    showUndo({
      message: t('undo.documentRemoved'),
      undo: async () => { await undoDeleteAttachment(db, d.id); if (mounted.current) setDocs(await listAttachments(db, w!.id)); },
      commit: () => purgeBefore(new Date(Date.now() + 1000).toISOString()),
    });
  }
  async function relabel(d: Attachment, label: DocLabel) {
    const db = await getDb();
    await setAttachmentLabel(db, d.id, label);
    setDocs(await listAttachments(db, w!.id));
  }
  async function reloadExtras() {
    const db = await getDb();
    const n = w!.id;
    const found = await getWarranty(db, n);
    if (!mounted.current) return;
    setW(found);
    setClaims(await listClaims(db, n));
    setReminders(await listCustomReminders(db, n));
    setMine(await collectionsOf(db, n));
    setBundle(found?.bundle_id ? (await bundleMembers(db, found.bundle_id)).filter((m) => m.id !== n) : []);
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
      void saveKnownText(result.localPath, result.text).catch(() => {});
      const saved = await current.save(async (path) => {
        await addAttachment(db, w!.id, docs.length ? `${product} (${docs.length + 1}).pdf` : `${product}.pdf`, path!, docs.length ? 'other' : 'receipt');
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
      { text: t('detail.photoLibrary'), onPress: () => void take('library') },
      { text: t('detail.photoCamera'), onPress: () => void take('camera') },
    ]);
  }

  async function notWarranty() {
    await ignoreWarranty(await getDb(), w!.id);
    goBack();
  }

  // Deleted at once with Undo (shortlist 9); the rows and unused files go when the window ends.
  async function deleteNow() {
    const db = await getDb();
    const ids = [w!.id];
    await softDeleteWarranties(db, ids);
    showUndo({
      message: t('undo.deleted', { name: product }),
      undo: async () => { await undoDeleteWarranties(db, ids); await rescheduleReminders(db).catch(() => {}); },
      commit: () => purgeBefore(new Date(Date.now() + 1000).toISOString()),
    });
    void rescheduleReminders(db).catch(() => {});
    goBack();
  }

  async function archiveToggle() {
    const db = await getDb();
    const on = !w!.archived_at;
    await setArchived(db, [w!.id], on);
    if (!on) return reloadExtras();
    showUndo({ message: t('bulk.archived', { count: 1 }), undo: async () => { await setArchived(db, [w!.id], false); } });
    goBack();
  }

  async function toggleFavorite() {
    await setFavorite(await getDb(), w!.id, !w!.favorite);
    await reloadExtras();
  }

  // Claims (shortlist 6): one per repair or return case, with its status.
  async function startClaim() {
    if (!claimTitle.trim()) return;
    await addClaim(await getDb(), w!.id, { title: claimTitle.trim(), submitted_on: today });
    setClaimTitle('');
    await reloadExtras();
  }
  async function setClaimStatus(c: Claim, status: ClaimStatus) {
    await updateClaim(await getDb(), c.id, { status, notes: c.notes }, today);
    await reloadExtras();
  }

  // Own reminders (shortlist 12): a date and a few words; sent even with the automatic ones off.
  function addReminder() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    pickDate({ title: t('reminder.pickDate'), value: todayYmd(tomorrow), minimum: todayYmd(tomorrow), onPick: (ymd) => void (async () => {
      const db = await getDb();
      if (!(await addCustomReminder(db, w!.id, ymd, reminderNote.trim() || null))) showAlert(t('reminder.duplicate'));
      setReminderNote('');
      await reloadExtras();
      void rescheduleReminders(db).catch(() => {});
    })().catch((e) => showAlert(e instanceof Error ? e.message : String(e))) });
  }
  async function removeReminder(r: CustomReminder) {
    const db = await getDb();
    await deleteCustomReminder(db, r.id);
    await reloadExtras();
    void rescheduleReminders(db).catch(() => {});
  }

  async function openBundlePicker() {
    const db = await getDb();
    const all = [...(await listWarranties(db, 'complete')), ...(await listWarranties(db, 'needs_input'))];
    setCandidates(all.filter((o) => o.id !== w!.id && (!w!.bundle_id || o.bundle_id !== w!.bundle_id)));
    setSelectedBundleIds(new Set());
    setTimeout(() => setSheet('bundle'), 250);
  }

  async function onAddBundle() {
    const ids = Array.from(selectedBundleIds);
    if (!ids.length || !w) return;
    setSheet(null);
    setSelectedBundleIds(new Set());
    const db = await getDb();
    const bundleId = await bundleTogether(db, [w.id, ...ids]);
    setBundleLead(bundleId, w.id);
    await reloadExtras();
  }
  async function shareWithBundle(d: Attachment) {
    const n = await shareDocument(await getDb(), d.id, bundle.map((b) => b.id));
    showAlert(t('bundle.shared', { count: n }));
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
            { key: 'pin', icon: w.favorite ? 'star' : 'star-outline', label: t(w.favorite ? 'detail.unpin' : 'detail.pin'), onPress: () => void toggleFavorite() },
            {
              key: 'share',
              icon: 'share-outline',
              label: t('detail.shareRecord'),
              onPress: () => void getDb().then((db) => shareWarranties(db, [w.id], `warrantly-${product.replace(/[^\w-]+/g, '-')}.json`)).catch((e) => showAlert(String(e))),
            },
            { key: 'cover', icon: 'add-circle-outline', label: t('detail.addCover'), onPress: () => router.push({ pathname: '/warranty/edit', params: { copyFrom: String(w.id) } }) },
            { key: 'bundle', icon: 'cube-outline', label: t('bundle.add'), onPress: () => void openBundlePicker() },
            { key: 'collections', icon: 'albums-outline', label: t('collections.title'), onPress: () => setTimeout(() => setSheet('collections'), 250) },
            { key: 'transfer', icon: 'swap-horizontal-outline', label: t('transfer.title'), onPress: () => router.push({ pathname: '/transfer', params: { id: String(w.id) } }) },
            { key: 'archive', icon: 'archive-outline', label: t(w.archived_at ? 'bulk.unarchive' : 'bulk.archive'), onPress: () => void archiveToggle() },
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
            { key: 'delete', icon: 'trash-outline', label: t('detail.delete'), destructive: true, onPress: () => void deleteNow() },
          ],
        },
      ],
    },
  };
  const selectedDoc = typeof sheet === 'object' && sheet && 'doc' in sheet ? sheet.doc : null;
  const docSheet: { title: string; sections: SheetSection[] } | null = selectedDoc ? {
    title: selectedDoc.filename,
    sections: [
      {
        options: [
          { key: 'share', icon: 'share-social-outline', label: t('detail.shareFile'), onPress: () => { void share(selectedDoc); } },
          { key: 'label', icon: 'pricetag-outline', label: t('docs.changeLabel'), onPress: () => setTimeout(() => setSheet({ label: selectedDoc }), 250) },
          ...(bundle.length ? [{ key: 'bundle', icon: 'copy-outline' as const, label: t('bundle.shareDoc', { count: bundle.length }), onPress: () => void shareWithBundle(selectedDoc) }] : []),
          { key: 'remove', icon: 'trash-outline', label: t('detail.removeDocument'), destructive: true, onPress: () => void removeDocument(selectedDoc) },
        ],
      },
    ],
  } : null;
  const labelFor = typeof sheet === 'object' && sheet && 'label' in sheet ? sheet.label : null;
  const claimFor = typeof sheet === 'object' && sheet && 'claim' in sheet ? sheet.claim : null;
  const extraSheet: { title: string; sections: SheetSection[] } | null =
    labelFor ? { title: t('docs.changeLabel'), sections: [{ options: DOC_LABELS.map((l) => ({ key: l, label: t(`docLabel.${l}`), selected: labelFor.label === l, onPress: () => void relabel(labelFor, l) })) }] }
      : claimFor ? { title: claimFor.title, sections: [
        { title: t('claims.status'), options: CLAIM_STATUSES.map((s) => ({ key: s, label: t(`claims.status_${s}`), selected: claimFor.status === s, onPress: () => void setClaimStatus(claimFor, s) })) },
        { options: [{ key: 'del', icon: 'trash-outline', label: t('claims.delete'), destructive: true, onPress: () => void getDb().then((db) => deleteClaim(db, claimFor.id)).then(reloadExtras) }] },
      ] }
        : sheet === 'collections' ? { title: t('collections.title'), sections: [{ options: [
          ...allCollections.map((c) => ({ key: String(c.id), label: c.name, selected: mine.includes(c.id), onPress: () => void getDb().then((db) => setMembership(db, c.id, [w.id], !mine.includes(c.id))).then(reloadExtras) })),
          { key: 'manage', icon: 'albums-outline' as const, label: t('collections.manage'), onPress: () => router.push('/collections') },
        ] }] }
        : null;
  const openSheet = sheet === null || sheet === 'bundle' ? null : sheet === 'more' || sheet === 'add' ? sheets[sheet] : docSheet ?? extraSheet;
  const issues = completeness(w, docs);
  const toggleMissingDetails = () => {
    const dismissed = !w.details_dismissed;
    void getDb().then(db => dismissMissingDetails(db, w.id, dismissed))
      .then(() => setW(current => current && ({ ...current, details_dismissed: dismissed ? 1 : 0 })))
      .catch(e => showAlert(String(e)));
  };
  const fixIssue = (iss: Issue) => {
    if (iss.fix === 'attach') return setSheet('add');
    if (iss.fix === 'label') return setSheet({ label: docs[0] });
    router.push({ pathname: '/warranty/edit', params: { id: String(w.id), more: '1', focus: iss.key } });
  };
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
    ...serialEntries(w).map((entry, index, entries) => ({ label: entry.label || (entries.length === 1 ? t('detail.serial') : t('serials.number', { n: index + 1 })), value: entry.value })),
    w.notes && { label: t('detail.notes'), value: w.notes },
  ].filter((f): f is { label: string; value: string } => !!f);
  const contacts = [
    w.contact_email && { label: t('warranty.contact'), value: w.contact_email, url: mailUrl(w.contact_email) },
    w.contact_phone && { label: t('warranty.contact'), value: w.contact_phone, url: telUrl(w.contact_phone) },
    w.website_url && { label: t('warranty.website'), value: w.website_url.replace(/^https:\/\//, ''), url: webUrl(w.website_url) },
  ].filter((f): f is { label: string; value: string; url: string } => !!f && !!f.url); // an unsafe link is not offered

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
                {photo ? (
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
                  <DocThumb localPath={d.local_path} size={36} />
                  <View style={styles.flex}>
                    <Text style={styles.docName}>{d.filename}</Text>
                    <Pressable onPress={() => setSheet({ label: d })} accessibilityRole="button" accessibilityLabel={t('docs.labelIs', { label: t(`docLabel.${d.label}`) })} hitSlop={8}>
                      <Text style={[styles.docType, missing && styles.docMissing]}>{missing ? t('detail.fileMissing') : `${t(`docLabel.${d.label}`)} · ${t('docs.changeShort')}`}</Text>
                    </Pressable>
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

        {/* Shortlist 15: what is missing for a smooth claim, each with its fix. */}
        {(issues.length > 0 || !!w.details_dismissed) && (
          <Section title={t('complete.title')}>
            {issues.map((iss, i) => (
              <Row key={iss.key} separator={i > 0} iconInset onPress={() => fixIssue(iss)} chevron>
                <View style={styles.glyph}><AppIcon name={iss.level === 'needed' ? 'alert-circle-outline' : 'bulb-outline'} size={22} color={iss.level === 'needed' ? colors.warn : colors.ink2} /></View>
                <View style={styles.flex}>
                  <Text style={styles.noteText}>{t(`complete.${iss.key}`)}</Text>
                  <Text style={styles.docType}>{t(`complete.fix_${iss.fix}`)}</Text>
                </View>
              </Row>
            ))}
            <Row separator={issues.length > 0} onPress={toggleMissingDetails}>
              <Text style={styles.addText}>{t(w.details_dismissed ? 'attention.restore' : 'attention.dismiss')}</Text>
            </Row>
          </Section>
        )}

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

        {/* Shortlist 17: products bought together; documents can be shared between them. */}
        {bundle.length > 0 && (
          <Section title={t('bundle.title')}>
            {bundle.map((o, i) => (
              <Row
                key={o.id}
                separator={i > 0}
                iconInset
                onPress={() => router.push(`/warranty/${o.id}`)}
                accessibilityLabel={`${displayName(t, o)}, ${o.store_name}`}
              >
                <View style={[styles.tileSmall, { backgroundColor: CATEGORY_TILE[o.category ?? ''] ?? TILE.blue }]}>
                  <ProductIcon name={productIcon(o.product_name, o.category) as keyof typeof MaterialCommunityIcons.glyphMap} size={15} color="#fff" />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.bundleTitle} numberOfLines={1}>{displayName(t, o)}</Text>
                  <Text style={styles.docType}>{o.store_name} · {formatDate(o.end_date, i18n.language)}</Text>
                </View>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    void getDb().then((db) => leaveBundle(db, o.id)).then(reloadExtras);
                  }}
                  style={styles.removeBundleBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('bundle.removeOne', { name: displayName(t, o) })}
                  hitSlop={10}
                >
                  <AppIcon name="close-circle-outline" size={20} color={colors.ink2} />
                </Pressable>
              </Row>
            ))}
            <Row separator iconInset onPress={() => void getDb().then((db) => leaveBundle(db, w.id)).then(reloadExtras)}>
              <View style={styles.glyph}><AppIcon name="remove-circle-outline" size={22} color={colors.warn} /></View>
              <Text style={[styles.addText, { color: colors.warn }]}>{t('bundle.leave')}</Text>
            </Row>
          </Section>
        )}

        {mine.length > 0 && (
          <Section title={t('collections.title')}>
            <Row iconInset onPress={() => setSheet('collections')} chevron>
              <View style={styles.glyph}><AppIcon name="albums-outline" size={22} color={colors.tint} /></View>
              <Text style={[styles.noteText, styles.flex]}>{allCollections.filter((c) => mine.includes(c.id)).map((c) => c.name).join(', ')}</Text>
            </Row>
          </Section>
        )}

        {/* Shortlist 6: claim cases with their status. */}
        <Section title={t('claims.title')}>
          {claims.map((c, i) => (
            <Row key={c.id} separator={i > 0} onPress={() => setSheet({ claim: c })} chevron accessibilityLabel={`${c.title}, ${t(`claims.status_${c.status}`)}`}>
              <View style={styles.flex}>
                <Text style={styles.noteText}>{c.title}</Text>
                <Text style={styles.docType}>{`${t(`claims.status_${c.status}`)} · ${date(c.submitted_on)}${c.resolved_on ? ` – ${date(c.resolved_on)}` : ''}`}</Text>
              </View>
            </Row>
          ))}
          <View style={[styles.noteRow, claims.length > 0 && styles.noteRowLine]}>
            <Input style={styles.noteInput} value={claimTitle} onChangeText={setClaimTitle} placeholder={t('claims.placeholder')} accessibilityLabel={t('claims.title')} onSubmitEditing={startClaim} />
            <Button kind="glass" title={t('claims.start')} onPress={startClaim} disabled={!claimTitle.trim()} />
          </View>
        </Section>

        {/* Shortlist 12: the person's own reminders for this item. */}
        <Section title={t('reminder.title')}>
          {reminders.map((r, i) => (
            <Row key={r.id} separator={i > 0} style={styles.noteItem}>
              <Text style={[styles.noteText, styles.flex]}>{date(r.date)}{r.note ? `: ${r.note}` : ''}</Text>
              <Pressable style={({ pressed }) => [styles.round, pressed && styles.roundPressed]} onPress={() => void removeReminder(r)} accessibilityRole="button" accessibilityLabel={`${t('detail.delete')}: ${date(r.date)}`}>
                <AppIcon name="trash-outline" size={20} color={colors.bad} />
              </Pressable>
            </Row>
          ))}
          <View style={[styles.noteRow, reminders.length > 0 && styles.noteRowLine]}>
            <Input style={styles.noteInput} value={reminderNote} onChangeText={setReminderNote} placeholder={t('reminder.placeholder')} accessibilityLabel={t('reminder.title')} />
            <Button kind="glass" title={t('reminder.pickDate')} icon="calendar-outline" onPress={addReminder} />
          </View>
        </Section>

        {/* 4. Support and claims. */}
        <Section title={t('detail.support')}>
          <View style={styles.claim}>
            <Button title={t('assistant.title')} icon="document-text-outline" onPress={() => router.push({ pathname: '/claim-assistant', params: { id: String(w.id) } })} />
          </View>
          <Row onPress={() => router.push({ pathname: '/product-tools', params: { id: String(w.id) } })} chevron>
            <Text style={styles.noteText}>{t('productTools.title')}</Text>
          </Row>
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
      {datePicker}
      <Sheet open={openSheet !== null} onClose={() => setSheet(null)} title={openSheet?.title ?? ''} sections={openSheet?.sections ?? []} />
      <SheetFrame open={sheet === 'bundle'} onClose={() => { setSheet(null); setSelectedBundleIds(new Set()); }} title={t('bundle.add')}>
        <View style={styles.bundleSheetContainer}>
          {candidates.length === 0 ? (
            <Text style={styles.emptyCandidates}>{t('bundle.noCandidates')}</Text>
          ) : (
            <>
              <Text style={styles.sheetSub}>{t('bundle.selectHint')}</Text>
              <FlatList
                style={styles.bundleList}
                data={candidates}
                keyExtractor={(item) => String(item.id)}
                extraData={selectedBundleIds}
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
                scrollEventThrottle={16}
                overScrollMode="never"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: selectedBundleIds.size > 0 ? 84 : 16 }}
                renderItem={({ item, index }) => (
                  <CandidateRow
                    item={item}
                    separator={index > 0}
                    isSelected={selectedBundleIds.has(item.id)}
                    name={displayName(t, item)}
                    storeDate={`${item.store_name} · ${formatDate(item.purchase_date, i18n.language)}`}
                    onToggle={toggleCandidate}
                  />
                )}
              />
              {selectedBundleIds.size > 0 && (
                <Animated.View
                  style={[styles.dockWrapper, { transform: [{ translateY: floatY }], opacity: floatOpacity }]}
                >
                  <Pressable
                    pressScale={0.96}
                    style={styles.dockPill}
                    onPress={onAddBundle}
                    accessibilityRole="button"
                    accessibilityLabel={t('bundle.addSelected', { count: selectedBundleIds.size })}
                  >
                    <AppIcon name="checkmark-circle" size={20} color={colors.onAccent} />
                    <Text style={styles.dockText}>{t('bundle.addSelected', { count: selectedBundleIds.size })}</Text>
                  </Pressable>
                </Animated.View>
              )}
            </>
          )}
        </View>
      </SheetFrame>
    </>
  );
}

const CandidateRow = memo(function CandidateRow({
  item,
  separator,
  isSelected,
  name,
  storeDate,
  onToggle,
}: {
  item: Warranty;
  separator: boolean;
  isSelected: boolean;
  name: string;
  storeDate: string;
  onToggle: (id: number) => void;
}) {
  const styles = useStyles();
  return (
    <Row
      separator={separator}
      selected={isSelected}
      onPress={() => onToggle(item.id)}
    >
      <View style={[styles.bundleCheck, isSelected && styles.bundleCheckOn]}>
        {isSelected ? <AppIcon name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={[styles.bundleLabel, isSelected && styles.bundleLabelSelected]}>{name}</Text>
        <Text style={styles.docType}>{storeDate}</Text>
      </View>
    </Row>
  );
});

const useStyles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  hero: { gap: 10, paddingTop: 4, paddingHorizontal: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 52, height: 52, borderRadius: 13 },
  photoEmpty: { backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  title: { ...TYPE.title2, color: colors.ink },
  store: { ...TYPE.sub, color: colors.ink2, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  badge: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontVariant: ['tabular-nums'], ...TYPE.foot, fontWeight: '600' },
  note: { ...TYPE.sub, color: colors.warn },
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
  tileSmall: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  bundleTitle: { ...TYPE.body, color: colors.ink, fontWeight: '500' },
  removeBundleBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emptyCandidates: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', paddingVertical: 20 },
  sheetSub: { ...TYPE.foot, color: colors.ink2, paddingHorizontal: 4, paddingBottom: 10 },
  bundleCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.ink2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  bundleCheckOn: { backgroundColor: colors.tint, borderColor: colors.tint },
  bundleLabel: { ...TYPE.body, color: colors.ink },
  bundleLabelSelected: { color: colors.tintInk, fontWeight: '600' },
  bundleSheetContainer: { paddingHorizontal: 16, paddingBottom: 8, flexShrink: 1, minHeight: 0, maxHeight: 520, position: 'relative' },
  bundleList: { backgroundColor: colors.sheetGroup, borderRadius: RADIUS, overflow: 'hidden', flexGrow: 0, flexShrink: 1 },
  dockWrapper: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  dockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 26,
    backgroundColor: colors.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    boxShadow: colors.shadow,
  },
  dockText: { ...TYPE.headline, fontVariant: ['tabular-nums'], color: colors.onAccent, fontWeight: '700', letterSpacing: 0.2 },
  noteRowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginHorizontal: ROW_X, paddingHorizontal: 0 },
  noteInput: { flex: 1, minWidth: 0 },
}));
