import { Pressable, Text, TextInput, View } from '@/components/themeMotion';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import AppIcon from '@/components/Icon';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Animated, Keyboard, RefreshControl, SectionList, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addGmailAccount, syncAllAccounts } from '@/accounts';
import { useUpdateReady } from '@/appUpdate';
import { UpdateCard } from '@/components/UpdateCard';
import { shouldShowWhatsNew } from '@/whatsNew';
import { maybeAskReview } from '@/rate';
import { clearFoundPictures } from '@/legacyPictures';
import { runDueBackup } from '@/backup';
import { Sheet, type IconName, type SheetSection } from '@/components/Sheet';
import { DocumentSheet } from '@/components/DocumentSheet';
import { DocThumb } from '@/components/DocThumb';
import { displayName, formatMoney, WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listAccounts, listArchived, listAttachments, listReturnPrompts, listWarranties, type Account, type Attachment, type Warranty } from '@/db/repo.ts';
import {
  collectionMembers, dismissedPairs, listAllDocuments, listCollections, listInbox, setArchived, setCategory, setMembership, restoreCategories,
  warrantiesWithText, type Collection, type DocumentRow,
} from '@/db/features.ts';
import { duplicatePairs } from '@/duplicates';
import { exportDocuments } from '@/documents';
import { openViewer } from '@/docOpen';
import { runIndex } from '@/docIndex';
import { quickFilter, sortWarranties, splitPinned, summary, SORT_KEYS, type QuickFilter, type SortKey } from '@/listView';
import { liveRecent } from '@/recent';
import { forgetRecent, readRecent } from '@/recentStore';
import { rescheduleReminders } from '@/reminders';
import { readBackupHealth } from '@/backupStatus';
import { getDensity, getListSort, getUsername, setListSort, type Density } from '@/settings';
import { BAR_H, colors, CONTROL_H, FIELD_RADIUS, gutter, isDarkNow, RADIUS, SPRING_BOUNCE, TYPE, themed } from '@/theme';
import { Button, glass, GlassButton, Group, reduceMotion, Row, SectionHeader } from '@/components/ui';
import { LargeTitle, NavBar, useScrollEdge } from '@/components/Page';
import { showAlert } from '@/components/Dialog';
import { finishPendingDeletes, showUndo } from '@/undo';
import { CATEGORIES, daysUntil, filterWarranties, plain, todayYmd, totalValue, warrantyFacets } from '@/warranty';
import { updateWidget } from '@/widget';

type SyncState = { kind: 'idle'; problems: string[] } | { kind: 'syncing'; email: string; done: number; total: number };
// What the filter sheet narrows the list to; one at a time, so it is always clear what is shown.
type Filter =
  | { kind: 'all' } | { kind: 'account'; id: number } | { kind: 'manual' } | { kind: 'category'; key: string } | { kind: 'store'; name: string }
  | { kind: 'collection'; id: number } | { kind: 'archived' };
type GroupKey = 'pinned' | 'soon' | 'covered' | 'expired' | 'archived';
type WarrantySection = { key: GroupKey; data: Warranty[] };
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList<Warranty, WarrantySection>);

// Warranty list (section 13): one list with no tabs to switch, so anyone can find their way. Pinned items
// first, then expiring soon, then the rest that is still covered; expired ones stay folded until asked for.
// A labelled bottom bar (Warranties, Add, Settings) stays visible, also while selecting. Filter opens a sheet
// with the order, quick filters, collections, accounts, categories and stores. Above the list: one slim
// summary, then short status rows only when there is something to act on.
export default function Home() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ quick?: string; search?: string }>();
  const name = getUsername();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [quick, setQuick] = useState<QuickFilter>(null);
  const [sort, setSort] = useState<SortKey>(() => (SORT_KEYS.includes(getListSort() as SortKey) ? getListSort() as SortKey : 'expiry'));
  const [density, setDensityState] = useState<Density>(getDensity);
  const [showExpired, setShowExpired] = useState(false);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [archived, setArchivedList] = useState<Warranty[]>([]);
  const [attention, setAttention] = useState(0);
  const [inbox, setInbox] = useState(0);
  const [duplicates, setDuplicates] = useState(0);
  const [backupFailed, setBackupFailed] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [members, setMembers] = useState<Map<number, Set<number>>>(new Map());
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [textHits, setTextHits] = useState<{ q: string; hits: Set<number> }>({ q: '', hits: new Set() });
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentVersion, setRecentVersion] = useState(0);
  const [selected, setSelected] = useState<Set<number> | null>(null); // null: not selecting
  const [bulk, setBulk] = useState<null | 'actions' | 'category' | 'collection'>(null);
  const [docSheet, setDocSheet] = useState<{ w: Warranty; docs: Attachment[] } | null>(null);
  const [sync, setSync] = useState<SyncState>({ kind: 'idle', problems: [] });
  const updateReady = useUpdateReady();
  const syncing = useRef(false);
  const listRef = useRef<SectionList<Warranty, WarrantySection>>(null);
  const searchRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Keep Add and Settings visible, and keep scroll events entirely on the native driver.
  const edge = useScrollEdge();
  const searchQuery = useDeferredValue(query);
  const loadVersion = useRef(0);
  const started = useRef(false);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!started.current) {
      started.current = true;
      await finishPendingDeletes().catch((e) => console.warn('undo', e)); // a delete whose undo window ended while closed
    }
    const version = ++loadVersion.current;
    const [nextAccounts, nextWarranties, needsInput, returns, nextArchived, nextInbox, nextCollections, nextMembers, dismissed, docs] = await Promise.all([
      listAccounts(db), listWarranties(db, 'complete'), listWarranties(db, 'needs_input'), listReturnPrompts(db), listArchived(db), listInbox(db),
      listCollections(db), collectionMembers(db), dismissedPairs(db), listAllDocuments(db),
    ]);
    if (version !== loadVersion.current) return;
    setAccounts(nextAccounts);
    setWarranties(nextWarranties);
    setArchivedList(nextArchived);
    setAttention(needsInput.length + returns.length);
    setInbox(nextInbox.length);
    setCollections(nextCollections);
    setMembers(nextMembers);
    setDocuments(docs);
    setDuplicates(duplicatePairs([...nextWarranties, ...needsInput, ...nextArchived], dismissed).length);
    void readBackupHealth().then((h) => setBackupFailed(h.state === 'failed' || h.state === 'overdue')).catch(() => {});
    setDensityState(getDensity());
    setRecentVersion((v) => v + 1);
    // Runs on open, after sync and after edits: the rolling reminder window (section 16).
    rescheduleReminders(db).catch((e) => console.warn('reminders', e)); // must not break the list
    void runDueBackup(db); // section 17: a due backup runs on app open
    updateWidget(db).catch((e) => console.warn('widget', e)); // section 13
    clearFoundPictures(db).catch((e) => console.warn('pictures', e)); // pictures found online were removed from the app
    // A few documents are read for search once the screen has settled; never during scrolling or typing.
    setTimeout(() => void runIndex(3).catch((e) => console.warn('index', e)), 1500);
  }, []);

  const runSync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setSync({ kind: 'syncing', email: '', done: 0, total: 0 });
    try {
      const db = await getDb();
      const problems = await syncAllAccounts(db, (email, done, total) => setSync({ kind: 'syncing', email, done, total }));
      setSync({ kind: 'idle', problems });
      await load();
    } catch (e) {
      setSync({ kind: 'idle', problems: [e instanceof Error ? e.message : String(e)] });
    } finally {
      syncing.current = false;
    }
  }, [load]);

  // Reload when coming back from another screen; sync once on app open (section 7).
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => setSync({ kind: 'idle', problems: [e instanceof Error ? e.message : String(e)] }));
    }, [load]),
  );
  useEffect(() => {
    if (name) void Promise.resolve().then(runSync);
    if (name && shouldShowWhatsNew()) router.push('/whats-new');
    else if (name) void getDb().then((db) => listWarranties(db, 'complete')).then((l) => maybeAskReview(l.length)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Links from the widget: a quick filter, or straight into search.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a link is an outside event
    if (params.quick === 'expiring' || params.quick === 'nodocs') { setFilter({ kind: 'all' }); setQuick(params.quick); }
    if (params.search) setTimeout(() => searchRef.current?.focus(), 350);
  }, [params.quick, params.search]);

  // Document text (shortlist 8): one indexed query per settled search, never per keystroke.
  useEffect(() => {
    const words = plain(searchQuery).split(/\s+/).filter((w) => w.length >= 3);
    if (!words.length) return;
    let live = true;
    void getDb().then((db) => warrantiesWithText(db, words)).then((hits) => { if (live) setTextHits({ q: searchQuery, hits }); }).catch(() => {});
    return () => { live = false; };
  }, [searchQuery, documents]);

  async function connect() {
    try {
      const added = await addGmailAccount(await getDb());
      if (added?.needsRange) router.push({ pathname: '/sync-range', params: { email: added.email } }); // syncs when started
      else if (added) await runSync();
    } catch (e) {
      setSync({ kind: 'idle', problems: [e instanceof Error ? e.message : String(e)] });
    }
  }

  const today = todayYmd();
  const words = useMemo(() => plain(searchQuery).split(/\s+/).filter(Boolean), [searchQuery]);
  // Search: name, store, order and serial number, and (once read) the text of the documents.
  const matches = useCallback((w: Warranty) => {
    if (!words.length) return true;
    const text = plain(`${w.product_name ?? ''} ${w.store_name} ${w.order_number ?? ''} ${w.serial_number ?? ''}`);
    return words.every((word) => text.includes(word)) || (textHits.q === searchQuery && textHits.hits.has(w.id));
  }, [words, textHits, searchQuery]);
  const visible = useMemo(() => {
    const base = filter.kind === 'archived' ? archived : warranties;
    const common = {
      query: '',
      account: filter.kind === 'account' ? filter.id : filter.kind === 'manual' ? 'manual' as const : 'all' as const,
      category: filter.kind === 'category' ? filter.key : null,
      store: filter.kind === 'store' ? filter.name : null,
      soon: false,
    };
    const inCollection = filter.kind === 'collection' ? members.get(filter.id) ?? new Set<number>() : null;
    const pick = (list: Warranty[]) => sortWarranties(quickFilter(list.filter((w) => matches(w) && (!inCollection || inCollection.has(w.id))), quick, today), sort);
    if (filter.kind === 'archived') return { pinned: [], soon: [], covered: [], expired: [], archived: pick(base) };
    const active = pick(filterWarranties(base, { ...common, tab: 'active' }, today));
    const { pinned, rest } = splitPinned(active, today);
    const soon: Warranty[] = [], covered: Warranty[] = [];
    for (const w of rest) (daysUntil(w.end_date, today) <= 30 ? soon : covered).push(w);
    return { pinned, soon, covered, expired: pick(filterWarranties(base, { ...common, tab: 'expired' }, today)), archived: [] as Warranty[] };
  }, [warranties, archived, filter, quick, sort, matches, members, today]);
  const expiredOpen = showExpired || searchQuery.trim() !== '' || quick === 'nodocs'; // search includes expired items
  const sections = useMemo(() => [
    { key: 'pinned' as const, data: visible.pinned },
    { key: 'soon' as const, data: visible.soon },
    { key: 'covered' as const, data: visible.covered },
    { key: 'expired' as const, data: expiredOpen ? visible.expired : [] },
    { key: 'archived' as const, data: visible.archived },
  ].filter((s) => s.data.length > 0), [visible, expiredOpen]);
  const shownIds = useMemo(() => sections.flatMap((s) => s.data.map((w) => w.id)), [sections]);
  const counts = useMemo(() => summary(warranties, today), [warranties, today]);
  const total = useMemo(() => Object.entries(totalValue([...visible.pinned, ...visible.soon, ...visible.covered])).map(([cur, sum]) => formatMoney(sum, cur, i18n.language)).join(' + '), [visible, i18n.language]);
  const facets = useMemo(() => warrantyFacets(warranties), [warranties]);
  const docHits = useMemo(() => {
    if (!words.length) return [];
    return documents.filter((d) => words.every((word) => plain(`${d.filename} ${t(`docLabel.${d.label}`)} ${d.product_name ?? ''}`).includes(word) || (d.text ?? '').includes(word))).slice(0, 5);
  }, [documents, words, t]);
  const recent = useMemo(() => {
    void recentVersion;
    const live = new Set([...warranties, ...archived].map((w) => w.id));
    return liveRecent(readRecent(), live, new Set(documents.map((d) => d.id)));
  }, [recentVersion, warranties, archived, documents]);

  const toggle = useCallback((id: number) => setSelected((s) => {
    const next = new Set(s ?? []);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const startSelect = useCallback((id?: number) => setSelected(new Set(id === undefined ? [] : [id])), []);
  const openDocs = useCallback(async (w: Warranty) => {
    const docs = await listAttachments(await getDb(), w.id);
    if (docs.length === 1 && openViewer({ ...docs[0], warranty_id: w.id }, displayName(t, w))) return;
    setDocSheet({ w, docs });
  }, [t]);
  // Stable style references let unchanged rows skip renders during sync progress and typing.
  const rowStyles = useMemo(() => [
    [styles.card], [styles.card, styles.cardFirst], [styles.card, styles.cardLast], [styles.card, styles.cardFirst, styles.cardLast],
  ], [styles]);
  const selecting = selected !== null;
  const renderWarranty = useCallback(({ item, index, section }: { item: Warranty; index: number; section: { data: readonly Warranty[] } }) => (
    <WarrantyRow
      warranty={item}
      separator={index > 0}
      style={rowStyles[(index === 0 ? 1 : 0) + (index === section.data.length - 1 ? 2 : 0)]}
      density={density}
      selecting={selecting}
      selected={selected?.has(item.id)}
      onToggle={toggle}
      onLongPress={startSelect}
      onDocument={openDocs}
    />
  ), [rowStyles, density, selecting, selected, toggle, startSelect, openDocs]);
  if (!name) return <Redirect href="/onboarding" />;
  const all: Filter = { kind: 'all' };
  const inAll = (f: Filter) =>
    f.kind === 'all' ? facets.total : f.kind === 'account' ? facets.accounts.get(f.id) ?? 0 : f.kind === 'manual' ? facets.accounts.get('manual') ?? 0
      : f.kind === 'category' ? facets.categories.get(f.key) ?? 0 : f.kind === 'store' ? facets.stores.get(f.name) ?? 0
        : f.kind === 'collection' ? collections.find((c) => c.id === f.id)?.count ?? 0 : archived.length;
  const same = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b);
  const filterName = (f: Filter): string =>
    f.kind === 'account' ? (accounts?.find((a) => a.id === f.id)?.email ?? '') : f.kind === 'manual' ? t('home.tabManual') : f.kind === 'category' ? t(`category.${f.key}`)
      : f.kind === 'store' ? f.name : f.kind === 'collection' ? (collections.find((c) => c.id === f.id)?.name ?? '') : f.kind === 'archived' ? t('home.archived') : t('home.menuAll');

  const scrollTop = () => listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false });
  // eslint-disable-next-line react-hooks/refs -- ref is read only inside the tap callback
  const menuItem = (f: Filter) => ({ key: JSON.stringify(f), label: filterName(f), count: inAll(f), selected: same(f, filter), onPress: () => { Keyboard.dismiss(); setFilter(f); scrollTop(); } });
  const problems = sync.kind === 'idle' ? sync.problems : [];
  const showProblems = () =>
    showAlert(t('home.syncFailed', { count: problems.length }), problems.join('\n\n'), [
      { text: t('detail.cancel'), style: 'cancel' },
      { text: t('home.retry'), onPress: () => void runSync() },
    ]);
  const status: { key: string; icon: IconName; color: string; label: string; action: string; onPress: () => void }[] = [
    ...(attention > 0 ? [{ key: 'attention', icon: 'alert-circle-outline' as const, color: colors.warn, label: t('home.attentionRow'), action: String(attention), onPress: () => router.push('/attention') }] : []),
    ...(inbox > 0 ? [{ key: 'inbox', icon: 'file-tray-full-outline' as const, color: colors.tint, label: t('inbox.row', { count: inbox }), action: t('inbox.review'), onPress: () => router.push('/inbox') }] : []),
    ...(duplicates > 0 ? [{ key: 'dups', icon: 'copy-outline' as const, color: colors.tint, label: t('dups.row', { count: duplicates }), action: t('dups.review'), onPress: () => router.push('/duplicates') }] : []),
    ...(problems.length > 0 ? [{ key: 'sync', icon: 'cloud-offline-outline' as const, color: colors.bad, label: t('home.syncFailed', { count: problems.length }), action: t('home.details'), onPress: showProblems }] : []),
    ...(backupFailed ? [{ key: 'backup', icon: 'cloud-offline-outline' as const, color: colors.bad, label: t('health.failedRow'), action: t('home.details'), onPress: () => router.push('/backup-status') }] : []),
  ];
  const usedCategories = CATEGORIES.filter((c) => facets.categories.has(c));
  const stores = [...facets.stores.keys()].sort((a, b) => a.localeCompare(b));
  const chooseSort = (k: SortKey) => { setListSort(k); setSort(k); scrollTop(); };
  const chooseQuick = (q: QuickFilter) => { setQuick((cur) => (cur === q ? null : q)); scrollTop(); };
  const menu: SheetSection[] = [
    { title: t('home.sortBy'), options: SORT_KEYS.map((k) => ({ key: `sort-${k}`, label: t(`home.sort_${k}`), selected: sort === k, onPress: () => chooseSort(k) })) },
    {
      title: t('home.show'),
      options: [
        menuItem(all),
        { key: 'q-expiring', label: t('home.quickExpiring'), count: counts.expiring, selected: quick === 'expiring', onPress: () => chooseQuick('expiring') },
        { key: 'q-nodocs', label: t('home.quickNoDocs'), count: counts.noDocs, selected: quick === 'nodocs', onPress: () => chooseQuick('nodocs') },
        ...(archived.length ? [menuItem({ kind: 'archived' })] : []),
      ],
    },
    {
      title: t('collections.title'),
      options: [
        ...collections.map((c) => menuItem({ kind: 'collection', id: c.id })),
        { key: 'manage', icon: 'albums-outline' as const, label: t('collections.manage'), onPress: () => router.push('/collections') },
      ],
    },
    ...(accounts?.length
      ? [{ title: t('home.menuAccounts'), options: [...accounts.map((a) => menuItem({ kind: 'account', id: a.id })), menuItem({ kind: 'manual' })] }]
      : []),
    ...(usedCategories.length ? [{ title: t('form.category'), options: usedCategories.map((key) => menuItem({ kind: 'category', key })) }] : []),
    ...(stores.length > 1 ? [{ title: t('home.menuStores'), options: stores.map((n) => menuItem({ kind: 'store', name: n })) }] : []),
    {
      options: [
        { key: 'select', icon: 'checkmark-circle-outline' as const, label: t('bulk.select'), onPress: () => startSelect() },
        { key: 'documents', icon: 'documents-outline' as const, label: t('docs.title'), onPress: () => router.push('/documents') },
      ],
    },
  ];

  const header = (
    <View style={styles.header}>
      <LargeTitle title={t('home.title')} onLayout={edge.onTitleLayout} />
      <View style={styles.searchBar}>
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('home.search')}
          placeholderTextColor={colors.ink2}
          selectionColor={colors.tint}
          accessibilityLabel={t('home.search')}
          accessibilityHint={t('home.searchHint')}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        {query !== '' && (
          <Pressable style={styles.clear} onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('home.clearSearch')}>
            <AppIcon name="close-circle" size={18} color={colors.ink2} />
          </Pressable>
        )}
      </View>
      {(filter.kind !== 'all' || quick) && (
        <View style={styles.chips}>
          {filter.kind !== 'all' && (
            <Pressable style={styles.filterChip} onPress={() => setFilter(all)} accessibilityRole="button" accessibilityLabel={t('home.clearFilter', { name: filterName(filter) })}>
              <Text style={styles.filterChipText}>{t('home.showing', { name: filterName(filter) })}</Text>
              <AppIcon name="close" size={18} color={colors.tintInk} />
            </Pressable>
          )}
          {quick && (
            <Pressable style={styles.filterChip} onPress={() => setQuick(null)} accessibilityRole="button" accessibilityLabel={t('home.clearFilter', { name: t(quick === 'expiring' ? 'home.quickExpiring' : 'home.quickNoDocs') })}>
              <Text style={styles.filterChipText}>{t(quick === 'expiring' ? 'home.quickExpiring' : 'home.quickNoDocs')}</Text>
              <AppIcon name="close" size={18} color={colors.tintInk} />
            </Pressable>
          )}
        </View>
      )}
      {counts.covered > 0 && filter.kind !== 'archived' && !selecting && (
        // Shortlist 1: one slim line of counts; each count is a button for its results.
        <View style={[styles.summary, (width - 2 * gutter(width)) / fontScale < 280 && { flexDirection: 'column' }]} accessibilityRole="toolbar">
          <SummaryItem value={counts.covered} label={t('summary.covered')} on={!quick} onPress={() => { setQuick(null); setFilter(all); scrollTop(); }} />
          <SummaryItem value={counts.expiring} label={t('summary.expiring')} on={quick === 'expiring'} tone={counts.expiring ? colors.warn : undefined} onPress={() => chooseQuick('expiring')} />
          <SummaryItem value={counts.noDocs} label={t('summary.noDocs')} on={quick === 'nodocs'} tone={counts.noDocs ? colors.bad : undefined} onPress={() => chooseQuick('nodocs')} />
        </View>
      )}
      {sync.kind === 'syncing' && (
        // Routine sync stays quiet: one small line, no banner.
        <View style={styles.syncLine} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.ink2} />
          <Text style={styles.syncText}>{sync.total > 0 ? `${sync.email}: ${t('home.progress', { done: sync.done, total: sync.total })}` : sync.email ? t('home.syncing', { email: sync.email }) : t('home.syncStarting')}</Text>
        </View>
      )}
      {/* eslint-disable-next-line react-hooks/refs -- the rows' taps read refs, not the render */}
      {status.length > 0 && !selecting && (
        <Group style={styles.statusCard}>
          {/* eslint-disable-next-line react-hooks/refs */}
          {status.map((s, i) => <StatusRow key={s.key} separator={i > 0} icon={s.icon} color={s.color} label={s.label} action={s.action} onPress={s.onPress} />)}
        </Group>
      )}
      {!selecting && <UpdateCard pending={updateReady} />}
      {docHits.length > 0 && (
        <View>
          <SectionHeader title={t('docs.found')} />
          <Group>
            {docHits.map((d, i) => (
              <Row key={d.id} separator={i > 0} onPress={() => openViewer(d, d.product_name ?? d.filename) || router.push(`/warranty/${d.warranty_id}`)} accessibilityLabel={`${t(`docLabel.${d.label}`)}: ${d.filename}, ${d.product_name ?? ''}`} chevron>
                <DocThumb localPath={d.local_path} size={30} />
                <View style={styles.flex}>
                  <Text style={styles.statusText} numberOfLines={1}>{d.product_name ?? d.filename}</Text>
                  <Text style={styles.syncText} numberOfLines={1}>{`${t(`docLabel.${d.label}`)} · ${d.filename}`}</Text>
                </View>
              </Row>
            ))}
          </Group>
        </View>
      )}
      {recent.length > 0 && !searchQuery && !selecting && filter.kind === 'all' && !quick && (
        // Shortlist 22: small and folded by default; the list itself stays the first thing on screen.
        <Group style={styles.statusCard}>
          <Row onPress={() => setRecentOpen((o) => !o)} accessibilityState={{ expanded: recentOpen }} iconInset>
            <View style={styles.glyph}><AppIcon name="time-outline" size={22} color={colors.ink2} /></View>
            <Text style={styles.statusText}>{t('recent.title')}</Text>
            <AppIcon name={recentOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.chevron} />
          </Row>
          {recentOpen && recent.map((e) => {
            const w = [...warranties, ...archived].find((x) => x.id === (e.kind === 'warranty' ? e.id : e.warrantyId));
            const d = e.kind === 'document' ? documents.find((x) => x.id === e.id) : null;
            if (!w) return null;
            return (
              <Row key={`${e.kind}${e.id}`} separator iconInset chevron onPress={() => (d ? openViewer(d, displayName(t, w)) || router.push(`/warranty/${w.id}`) : router.push(`/warranty/${w.id}`))}>
                <View style={styles.glyph}><AppIcon name={d ? 'document-text-outline' : 'shield-checkmark-outline'} size={20} color={colors.tint} /></View>
                <Text style={styles.statusText} numberOfLines={1}>{d ? `${displayName(t, w)} · ${t(`docLabel.${d.label}`)}` : displayName(t, w)}</Text>
              </Row>
            );
          })}
          {recentOpen && (
            <Row separator iconInset onPress={() => { forgetRecent(); setRecentVersion((v) => v + 1); setRecentOpen(false); }}>
              <View style={styles.glyph} />
              <Text style={styles.statusAction}>{t('recent.clear')}</Text>
            </Row>
          )}
        </Group>
      )}
    </View>
  );

  const groupTitle = { pinned: 'home.sectionPinned', soon: 'home.sectionSoon', covered: 'home.sectionCovered', expired: 'home.sectionExpired', archived: 'home.sectionArchived' } as const;

  const clearSearchAndFilters = () => { setQuery(''); setFilter(all); setQuick(null); Keyboard.dismiss(); };
  const hasSearch = searchQuery.trim() !== '' || filter.kind !== 'all' || quick !== null;
  const empty = accounts === null ? <ActivityIndicator style={styles.empty} color={colors.tint} /> : accounts.length || warranties.length || archived.length ? (
    <View style={styles.connect}>
      <Text style={styles.connectBody}>{sync.kind === 'syncing' ? t('home.syncing', { email: sync.email }) : hasSearch ? t('home.noMatch') : t('home.empty_active')}</Text>
      {hasSearch && <Button title={t('home.resetFilters')} onPress={clearSearchAndFilters} kind="glass" />}
    </View>
  ) : (
    <View style={styles.connect}>
      <Text style={styles.connectTitle}>{t('home.emptyTitle')}</Text>
      <Text style={styles.connectBody}>{t('home.emptyBody')}</Text>
      <Button title={t('home.addLong')} onPress={() => router.push('/warranty/edit')} />
      <Button title={t('home.connectGmail')} onPress={connect} kind="glass" />
    </View>
  );

  const footer =
    visible.expired.length > 0 && searchQuery.trim() === '' && quick !== 'nodocs' && filter.kind !== 'archived' ? (
      <Group style={styles.expiredToggle}>
        <Row onPress={() => setShowExpired((v) => !v)} accessibilityState={{ expanded: showExpired }}>
          <Text style={styles.expiredToggleText}>{showExpired ? t('home.hideExpired') : t('home.showExpired', { count: visible.expired.length })}</Text>
          <AppIcon name={showExpired ? 'chevron-up' : 'chevron-down'} size={16} color={colors.chevron} />
        </Row>
      </Group>
    ) : undefined;

  // --- Bulk actions (shortlist 5) on the current selection ---
  const chosen = selected ? [...selected] : [];
  const endSelect = () => { setSelected(null); setBulk(null); };
  async function bulkExport() {
    const db = await getDb();
    const items: { local_path: string; name: string }[] = [];
    for (const id of chosen) {
      const w = [...warranties, ...archived].find((x) => x.id === id);
      for (const d of await listAttachments(db, id)) items.push({ local_path: d.local_path, name: `${w ? displayName(t, w) : id} - ${t(`docLabel.${d.label}`)}` });
    }
    if (!items.length) return showAlert(t('bulk.noDocuments'));
    try {
      const res = await exportDocuments(items);
      if (res) showAlert(t('bulk.exported', { count: res.written }), res.missing ? t('bulk.exportMissing', { count: res.missing }) : undefined);
    } catch (e) {
      showAlert(t('detail.saveFailed', { detail: e instanceof Error ? e.message : String(e) }));
    }
  }
  async function bulkCategory(key: string | null) {
    const db = await getDb();
    const before = await setCategory(db, chosen, key);
    endSelect();
    await load();
    showUndo({ message: t('bulk.categorized', { count: before.length }), undo: async () => { await restoreCategories(db, before); await load(); } });
  }
  async function bulkArchive(on: boolean) {
    const db = await getDb();
    const ids = chosen;
    await setArchived(db, ids, on);
    endSelect();
    await load();
    showUndo({ message: t(on ? 'bulk.archived' : 'bulk.unarchived', { count: ids.length }), undo: async () => { await setArchived(db, ids, !on); await load(); } });
  }
  async function bulkCollection(id: number) {
    await setMembership(await getDb(), id, chosen, true);
    endSelect();
    await load();
  }
  const bulkSheet: { title: string; sections: SheetSection[] } | null =
    bulk === 'actions' ? {
      title: t('bulk.count', { count: chosen.length }),
      sections: [{ options: [
        { key: 'export', icon: 'download-outline', label: t('bulk.exportDocs'), onPress: () => void bulkExport() },
        { key: 'category', icon: 'pricetag-outline', label: t('bulk.categorize'), onPress: () => setTimeout(() => setBulk('category'), 250) },
        { key: 'collection', icon: 'albums-outline', label: t('bulk.addToCollection'), onPress: () => setTimeout(() => setBulk('collection'), 250) },
        filter.kind === 'archived'
          ? { key: 'unarchive', icon: 'arrow-undo-outline', label: t('bulk.unarchive'), onPress: () => void bulkArchive(false) }
          : { key: 'archive', icon: 'archive-outline', label: t('bulk.archive'), onPress: () => void bulkArchive(true) },
      ] }],
    } : bulk === 'category' ? {
      title: t('bulk.categorize'),
      sections: [{ options: [...CATEGORIES.map((c) => ({ key: c, label: t(`category.${c}`), onPress: () => void bulkCategory(c) })), { key: 'none', label: t('bulk.noCategory'), onPress: () => void bulkCategory(null) }] }],
    } : bulk === 'collection' ? {
      title: t('bulk.addToCollection'),
      sections: [{ options: [...collections.map((c) => ({ key: String(c.id), label: c.name, count: c.count, onPress: () => void bulkCollection(c.id) })),
        { key: 'new', icon: 'add-circle-outline' as const, label: t('collections.new'), onPress: () => router.push({ pathname: '/collections', params: { add: chosen.join(',') } }) }] }],
    } : null;

  return (
    <View style={styles.screen}>
      <AnimatedSectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(w: Warranty) => String(w.id)}
        renderItem={renderWarranty}
        renderSectionHeader={({ section }: { section: { key: GroupKey; data: readonly Warranty[] } }) => <SectionHeader title={t(groupTitle[section.key], { count: section.data.length })} />}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        extraData={selected}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + BAR_H, paddingHorizontal: gutter(width), paddingBottom: (selecting ? 160 : 88) + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={edge.onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={sync.kind === 'syncing'}
            onRefresh={() => {
              void runSync();
            }}
            enabled={!!accounts?.length && !selecting}
            colors={[colors.tint]}
            progressViewOffset={insets.top + BAR_H}
          />
        }
      />
      <NavBar
        title={selecting ? t('bulk.count', { count: chosen.length }) : t('home.title')}
        t={edge.t}
        back={false}
        leading={selecting ? <GlassButton icon="close" label={t('bulk.cancel')} onPress={endSelect} /> : undefined}
        trailing={selecting
          ? <GlassButton icon={chosen.length === shownIds.length && shownIds.length > 0 ? 'remove-circle-outline' : 'checkmark-done-outline'} label={t(chosen.length === shownIds.length && shownIds.length > 0 ? 'bulk.selectNone' : 'bulk.selectAll')} onPress={() => setSelected(chosen.length === shownIds.length ? new Set() : new Set(shownIds))} />
          : <GlassButton icon="funnel-outline" label={t('home.filter')} color={filter.kind !== 'all' || quick ? colors.tint : colors.ink} selected={filter.kind !== 'all' || quick !== null} onPress={() => setMenuOpen(true)} />}
      />
      {selecting && (
        <View style={[styles.bulkBar, { bottom: insets.bottom + 84 }]}>
          <Button title={t('bulk.actions', { count: chosen.length })} icon="ellipsis-horizontal-circle-outline" onPress={() => setBulk('actions')} disabled={!chosen.length} style={styles.flex} />
        </View>
      )}
      <TabBar
        tabs={[
          { key: 'list', icon: 'shield-checkmark-outline', iconOn: 'shield-checkmark', label: t('home.title'), onPress: () => listRef.current?.getScrollResponder()?.scrollTo({ y: 0 }) },
          { key: 'add', icon: 'add-circle-outline', label: t('home.add'), accessibilityLabel: t('home.addLong'), onPress: () => router.push('/warranty/edit') },
          { key: 'settings', icon: 'settings-outline', label: t('settings.title'), onPress: () => router.push('/settings') },
        ]}
        current="list"
      />
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('home.filter')} subtitle={total ? t('home.total', { total }) : undefined} sections={menu} />
      {/* eslint-disable-next-line react-hooks/refs -- options read refs only when tapped */}
      <Sheet open={bulkSheet !== null} onClose={() => setBulk(null)} title={bulkSheet?.title ?? ''} sections={bulkSheet?.sections ?? []} />
      <DocumentSheet warranty={docSheet?.w ?? null} docs={docSheet?.docs ?? []} title={docSheet ? displayName(t, docSheet.w) : ''} onClose={() => setDocSheet(null)} />
    </View>
  );
}

// One count in the summary line: the number large enough to scan, its words below; 44dp tall.
function SummaryItem({ value, label, on, tone, onPress }: { value: number; label: string; on: boolean; tone?: string; onPress: () => void }) {
  const styles = useStyles();
  const { width, fontScale } = useWindowDimensions();
  const stacked = (width - 2 * gutter(width)) / fontScale < 280;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sumItem, stacked && { flex: 0, width: '100%' }, on && styles.sumOn, pressed && styles.sumPressed]} accessibilityRole="button" accessibilityLabel={`${value} ${label}`} accessibilityState={{ selected: on }}>
      <Text style={[styles.sumValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </Pressable>
  );
}

// A short row in the status card: glyph, plain words, and what a tap does (in link colour).
function StatusRow({ icon, color, label, action, onPress, separator }: { icon: IconName; color: string; label: string; action: string; onPress: () => void; separator?: boolean }) {
  const styles = useStyles();
  const { width, fontScale } = useWindowDimensions();
  const stacked = (width - 32) / fontScale < 300;
  return (
    <Row onPress={onPress} separator={separator} iconInset>
      <View style={styles.glyph}>
        <AppIcon name={icon} size={22} color={color} />
      </View>
      {stacked ? <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={[styles.statusText, { flex: 0 }]}>{label}</Text>
        <Text style={styles.statusAction}>{action}</Text>
      </View> : <>
        <Text style={styles.statusText}>{label}</Text>
        <Text style={styles.statusAction}>{action}</Text>
      </>}
    </Row>
  );
}

type Tab = { key: string; icon: IconName; iconOn?: IconName; label: string; accessibilityLabel?: string; onPress: () => void };
// Stable navigation: all three destinations remain one tap away while scrolling.
function TabBar({ tabs, current }: { tabs: Tab[]; current: string }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tabH, setTabH] = useState(54);
  const barW = Math.min(368, width - 42);
  const tabW = (barW - 8) / tabs.length;
  const at = Math.max(0, tabs.findIndex((tab) => tab.key === current));
  return (
    <>
      <View style={[styles.scrollEdge, { height: 80 + insets.bottom }]} pointerEvents="none" />
      <View style={[styles.tabbar, { width: barW, bottom: insets.bottom + 8 }]} accessibilityRole="tablist">
        <View style={[styles.tabSurface, glass(), { boxShadow: colors.tabbarEdge, width: barW, left: 0 }]} pointerEvents="none" />
        <View style={[styles.lens, { top: 4, height: tabH, width: tabW, left: 4 + at * tabW }]} pointerEvents="none" />
        {tabs.map((tab, i) => (
          <View key={tab.key} style={styles.tabSlot} onLayout={i === at ? (e) => setTabH(e.nativeEvent.layout.height) : undefined}>
            <TabButton tab={tab} on={i === at} />
          </View>
        ))}
      </View>
    </>
  );
}

function TabButton({ tab, on }: { tab: Tab; on: boolean }) {
  const styles = useStyles();
  const scale = useState(() => new Animated.Value(1))[0];
  const press = (v: number) => {
    if (!reduceMotion()) Animated.spring(scale, { toValue: v, useNativeDriver: true, ...SPRING_BOUNCE }).start();
  };
  return (
    <Pressable testID={`tab-${tab.key}`} style={styles.tab} onPress={tab.onPress}
      onPressIn={() => press(0.86)} onPressOut={() => press(1)}
      accessibilityRole="tab" accessibilityLabel={tab.accessibilityLabel ?? tab.label} accessibilityState={{ selected: on }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <AppIcon name={on && tab.iconOn ? tab.iconOn : tab.icon} size={24} color={on ? colors.tint : colors.ink} />
      </Animated.View>
      <Text style={[styles.tabLabel, on && { color: colors.tintInk }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{tab.label}</Text>
    </Pressable>
  );
}

// The page colour as an rgb triple, for the scroll-edge gradients.
const rgb = () => (isDarkNow() ? '0,0,0' : '242,242,247');
const useStyles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flexGrow: 1 },
  header: { gap: 12 },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Summary line (shortlist 1): three equal buttons on one card.
  summary: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: RADIUS, backgroundColor: colors.card },
  // Align the counts even when one translated label needs another line.
  sumItem: { flex: 1, minHeight: 56, borderRadius: RADIUS - 4, alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 6, paddingHorizontal: 4 },
  sumOn: { backgroundColor: colors.select },
  sumPressed: { opacity: 0.6 },
  sumValue: { ...TYPE.title3, color: colors.ink, fontVariant: ['tabular-nums'] },
  sumLabel: { ...TYPE.foot, color: colors.ink2, textAlign: 'center' },
  bulkBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row' },
  // Search: the reference's page search field (`input.quick-search`, ios.css line 943): the standard 44dp
  // field, 9/12 padding, 14 radius, on --card, no glyph. Clear sits inside it like the search input's own x.
  searchBar: { flexDirection: 'row', alignItems: 'center', minHeight: CONTROL_H, borderRadius: FIELD_RADIUS, backgroundColor: colors.card, paddingLeft: 12, paddingRight: 2 },
  searchInput: { flex: 1, minHeight: CONTROL_H, ...TYPE.body, color: colors.ink, paddingVertical: 9, paddingHorizontal: 0 },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, minHeight: CONTROL_H, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22, backgroundColor: colors.tintSoft, maxWidth: '100%' },
  filterChipText: { flexShrink: 1, ...TYPE.sub, fontWeight: '600', color: colors.tintInk },
  syncLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  syncText: { flex: 1, ...TYPE.foot, color: colors.ink2 },
  statusCard: { marginTop: 8 },
  glyph: { width: 29, alignItems: 'center' },
  statusText: { flex: 1, ...TYPE.body, color: colors.ink },
  statusAction: { ...TYPE.body, color: colors.link },
  // Each group is one card; rows keep their separators inside it.
  card: { backgroundColor: colors.card },
  cardFirst: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  cardLast: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  expiredToggle: { marginTop: 20 },
  expiredToggleText: { flex: 1, ...TYPE.body, color: colors.ink },
  empty: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', marginTop: 48 },
  connect: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 48 },
  connectTitle: { ...TYPE.title3, color: colors.ink, textAlign: 'center' },
  connectBody: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', maxWidth: 320 },
  // The phone scroll edge under the tab bar (ios.css lines 704-706); dark mode at .35.
  scrollEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    opacity: isDarkNow() ? 0.35 : 1,
    backgroundImage: `linear-gradient(rgba(${rgb()},0) 0%, rgba(${rgb()},0.82) 55%, rgba(${rgb()},1) 100%)`,
  },
  tabbar: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', padding: 4 },
  tabSurface: { position: 'absolute', top: 0, bottom: 0, borderRadius: 31 },
  lens: { position: 'absolute', borderRadius: 28, backgroundColor: colors.select },
  tabSlot: { flex: 1, minWidth: 0 },
  tab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 28, paddingHorizontal: 2 },
  tabLabel: { ...TYPE.tab, color: colors.ink, maxWidth: '100%' },
}));
