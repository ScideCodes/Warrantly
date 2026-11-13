import { Pressable, Text, TextInput, View } from '@/components/themeMotion';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import AppIcon from '@/components/Icon';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Animated, Keyboard, RefreshControl, SectionList, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addGmailAccount, syncAllAccounts } from '@/accounts';
import { restartIntoUpdate, useUpdateReady } from '@/appUpdate';
import { shouldShowWhatsNew } from '@/whatsNew';
import { maybeAskReview } from '@/rate';
import { runPictureLookups } from '@/productImageLookup';
import { runDueBackup } from '@/backup';
import { Sheet, type IconName, type SheetSection } from '@/components/Sheet';
import { formatMoney, WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listAccounts, listReturnPrompts, listWarranties, type Account, type Warranty } from '@/db/repo.ts';
import { rescheduleReminders } from '@/reminders';
import { getUsername } from '@/settings';
import { BAR_H, colors, CONTROL_H, FIELD_RADIUS, gutter, isDarkNow, RADIUS, SPRING_BOUNCE, TYPE, themed } from '@/theme';
import { Button, glass, GlassButton, Group, reduceMotion, Row, SectionHeader } from '@/components/ui';
import { LargeTitle, NavBar, useScrollEdge } from '@/components/Page';
import { showAlert } from '@/components/Dialog';
import { CATEGORIES, daysUntil, filterWarranties, todayYmd, totalValue, warrantyFacets } from '@/warranty';
import { updateWidget } from '@/widget';

type SyncState = { kind: 'idle'; problems: string[] } | { kind: 'syncing'; email: string; done: number; total: number };
// What the filter sheet narrows the list to; one at a time, so it is always clear what is shown.
type Filter = { kind: 'all' } | { kind: 'account'; id: number } | { kind: 'manual' } | { kind: 'category'; key: string } | { kind: 'store'; name: string };
type GroupKey = 'soon' | 'covered' | 'expired';
type WarrantySection = { key: GroupKey; data: Warranty[] };
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList<Warranty, WarrantySection>);

// Warranty list (section 13): one list with no tabs to switch, so anyone can find their way. Expiring
// soon comes first, then the rest that is still covered; expired ones stay folded until asked for.
// A labelled bottom bar (Warranties, Add, Settings); Filter opens a sheet with the account, category and
// store filters. Above the list only short status rows, and only when there is something to act on.
export default function Home() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const name = getUsername();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [showExpired, setShowExpired] = useState(false);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [attention, setAttention] = useState(0);
  const [sync, setSync] = useState<SyncState>({ kind: 'idle', problems: [] });
  const updateReady = useUpdateReady();
  const syncing = useRef(false);
  const listRef = useRef<SectionList<Warranty, WarrantySection>>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Keep Add and Settings visible, and keep scroll events entirely on the native driver.
  const edge = useScrollEdge();
  const searchQuery = useDeferredValue(query);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const db = await getDb();
    const version = ++loadVersion.current;
    const [nextAccounts, nextWarranties, needsInput, returns] = await Promise.all([
      listAccounts(db), listWarranties(db, 'complete'), listWarranties(db, 'needs_input'), listReturnPrompts(db),
    ]);
    if (version !== loadVersion.current) return;
    setAccounts(nextAccounts);
    setWarranties(nextWarranties);
    setAttention(needsInput.length + returns.length);
    // Runs on open, after sync and after edits: the rolling reminder window (section 16).
    rescheduleReminders(db).catch((e) => console.warn('reminders', e)); // must not break the list
    void runDueBackup(db); // section 17: a due backup runs on app open
    updateWidget(db).catch((e) => console.warn('widget', e)); // section 13
    // Product pictures (when turned on): a few lookups after the list is shown, never from the rows themselves.
    void runPictureLookups(db).then(async (changed) => {
      if (!changed) return;
      const pictures = await listWarranties(db, 'complete');
      if (version === loadVersion.current) setWarranties(pictures);
    }).catch((e) => console.warn('pictures', e));
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
  const { soon, covered, expired } = useMemo(() => {
    const common = {
      query: searchQuery,
      account: filter.kind === 'account' ? filter.id : filter.kind === 'manual' ? 'manual' as const : 'all' as const,
      category: filter.kind === 'category' ? filter.key : null,
      store: filter.kind === 'store' ? filter.name : null,
      soon: false,
    };
    const active = filterWarranties(warranties, { ...common, tab: 'active' }, today);
    const soon: Warranty[] = [], covered: Warranty[] = [];
    for (const w of active) (daysUntil(w.end_date, today) <= 30 ? soon : covered).push(w);
    return { soon, covered, expired: filterWarranties(warranties, { ...common, tab: 'expired' }, today) };
  }, [warranties, searchQuery, filter, today]);
  const expiredOpen = showExpired || searchQuery.trim() !== ''; // search includes expired items
  const sections = useMemo(() => [
    { key: 'soon' as const, data: soon },
    { key: 'covered' as const, data: covered },
    { key: 'expired' as const, data: expiredOpen ? expired : [] },
  ].filter((s) => s.data.length > 0), [soon, covered, expired, expiredOpen]);
  const total = useMemo(() => Object.entries(totalValue([...soon, ...covered])).map(([cur, sum]) => formatMoney(sum, cur, i18n.language)).join(' + '), [soon, covered, i18n.language]);
  const facets = useMemo(() => warrantyFacets(warranties), [warranties]);
  // Stable style references let unchanged rows skip renders during sync progress and typing.
  const rowStyles = useMemo(() => [
    [styles.card], [styles.card, styles.cardFirst], [styles.card, styles.cardLast], [styles.card, styles.cardFirst, styles.cardLast],
  ], [styles]);
  const renderWarranty = useCallback(({ item, index, section }: { item: Warranty; index: number; section: { data: readonly Warranty[] } }) => (
    <WarrantyRow warranty={item} separator={index > 0} style={rowStyles[(index === 0 ? 1 : 0) + (index === section.data.length - 1 ? 2 : 0)]} />
  ), [rowStyles]);
  if (!name) return <Redirect href="/onboarding" />;
  const all: Filter = { kind: 'all' };
  const inAll = (f: Filter) => f.kind === 'all' ? facets.total : f.kind === 'account' ? facets.accounts.get(f.id) ?? 0 : f.kind === 'manual' ? facets.accounts.get('manual') ?? 0 : f.kind === 'category' ? facets.categories.get(f.key) ?? 0 : facets.stores.get(f.name) ?? 0;
  const same = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b);
  const filterName = (f: Filter): string =>
    f.kind === 'account' ? (accounts?.find((a) => a.id === f.id)?.email ?? '') : f.kind === 'manual' ? t('home.tabManual') : f.kind === 'category' ? t(`category.${f.key}`) : f.kind === 'store' ? f.name : t('home.menuAll');

  // eslint-disable-next-line react-hooks/refs -- ref is read only inside the tap callback
  const menuItem = (f: Filter) => ({ key: JSON.stringify(f), label: filterName(f), count: inAll(f), selected: same(f, filter), onPress: () => { Keyboard.dismiss(); setFilter(f); listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false }); } });
  const problems = sync.kind === 'idle' ? sync.problems : [];
  const showProblems = () =>
    showAlert(t('home.syncFailed', { count: problems.length }), problems.join('\n\n'), [
      { text: t('detail.cancel'), style: 'cancel' },
      { text: t('home.retry'), onPress: () => void runSync() },
    ]);
  const statusRows = [
    attention > 0 && (
      <StatusRow key="attention" icon="alert-circle-outline" color={colors.warn} label={t('home.attentionRow')} action={String(attention)} onPress={() => router.push('/attention')} />
    ),
    problems.length > 0 && (
      <StatusRow key="sync" separator={attention > 0} icon="cloud-offline-outline" color={colors.bad} label={t('home.syncFailed', { count: problems.length })} action={t('home.details')} onPress={showProblems} />
    ),
    updateReady && (
      <StatusRow key="update" separator={attention > 0 || problems.length > 0} icon="arrow-up-circle-outline" color={colors.tint} label={t('home.updateReadyShort')} action={t('home.restart')} onPress={() => void restartIntoUpdate()} />
    ),
  ].filter(Boolean);
  const usedCategories = CATEGORIES.filter((c) => facets.categories.has(c));
  const stores = [...facets.stores.keys()].sort((a, b) => a.localeCompare(b));
  const menu: SheetSection[] = [
    { options: [menuItem(all)] },
    ...(accounts?.length
      ? [{ title: t('home.menuAccounts'), options: [...accounts.map((a) => menuItem({ kind: 'account', id: a.id })), menuItem({ kind: 'manual' })] }]
      : []),
    ...(usedCategories.length ? [{ title: t('form.category'), options: usedCategories.map((key) => menuItem({ kind: 'category', key })) }] : []),
    ...(stores.length > 1 ? [{ title: t('home.menuStores'), options: stores.map((name) => menuItem({ kind: 'store', name })) }] : []),
  ];

  const header = (
    <View style={styles.header}>
      <LargeTitle title={t('home.title')} onLayout={edge.onTitleLayout} />
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('home.search')}
          placeholderTextColor={colors.ink2}
          selectionColor={colors.tint}
          accessibilityLabel={t('home.search')}
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
      {filter.kind !== 'all' && (
        <Pressable style={styles.filterChip} onPress={() => setFilter(all)} accessibilityRole="button" accessibilityLabel={t('home.clearFilter', { name: filterName(filter) })}>
          <Text style={styles.filterChipText}>{t('home.showing', { name: filterName(filter) })}</Text>
          <AppIcon name="close" size={18} color={colors.tintInk} />
        </Pressable>
      )}
      {sync.kind === 'syncing' && (
        // Routine sync stays quiet: one small line, no banner.
        <View style={styles.syncLine} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.ink2} />
          <Text style={styles.syncText}>{sync.total > 0 ? `${sync.email}: ${t('home.progress', { done: sync.done, total: sync.total })}` : sync.email ? t('home.syncing', { email: sync.email }) : t('home.syncStarting')}</Text>
        </View>
      )}
      {statusRows.length > 0 && <Group style={styles.statusCard}>{statusRows}</Group>}
    </View>
  );

  const groupTitle = { soon: 'home.sectionSoon', covered: 'home.sectionCovered', expired: 'home.sectionExpired' } as const;

  const clearSearchAndFilters = () => { setQuery(''); setFilter(all); Keyboard.dismiss(); };
  const hasSearch = searchQuery.trim() !== '' || filter.kind !== 'all';
  const empty = accounts === null ? <ActivityIndicator style={styles.empty} color={colors.tint} /> : accounts.length || warranties.length ? (
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
    expired.length > 0 && searchQuery.trim() === '' ? (
      <Group style={styles.expiredToggle}>
        <Row onPress={() => setShowExpired((v) => !v)} accessibilityState={{ expanded: showExpired }}>
          <Text style={styles.expiredToggleText}>{showExpired ? t('home.hideExpired') : t('home.showExpired', { count: expired.length })}</Text>
          <AppIcon name={showExpired ? 'chevron-up' : 'chevron-down'} size={16} color={colors.chevron} />
        </Row>
      </Group>
    ) : undefined;


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
        contentContainerStyle={[styles.list, { paddingTop: insets.top + BAR_H, paddingHorizontal: gutter(width), paddingBottom: 88 + insets.bottom }]}
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
            enabled={!!accounts?.length}
            colors={[colors.tint]}
            progressViewOffset={insets.top + BAR_H}
          />
        }
      />
      <NavBar
        title={t('home.title')}
        t={edge.t}
        back={false}
        trailing={<GlassButton icon="funnel-outline" label={t('home.filter')} color={filter.kind !== 'all' ? colors.tint : colors.ink} selected={filter.kind !== 'all'} onPress={() => setMenuOpen(true)} />}
      />
      <TabBar
        tabs={[
          { key: 'list', icon: 'shield-checkmark-outline', iconOn: 'shield-checkmark', label: t('home.title'), onPress: () => listRef.current?.getScrollResponder()?.scrollTo({ y: 0 }) },
          { key: 'add', icon: 'add-circle-outline', label: t('home.add'), accessibilityLabel: t('home.addLong'), onPress: () => router.push('/warranty/edit') },
          { key: 'settings', icon: 'settings-outline', label: t('settings.title'), onPress: () => router.push('/settings') },
        ]}
        current="list"
      />
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('home.filter')} subtitle={total ? t('home.total', { total }) : undefined} sections={menu} />
    </View>
  );
}

// A short row in the status card: glyph, plain words, and what a tap does (in link colour).
function StatusRow({ icon, color, label, action, onPress, separator }: { icon: IconName; color: string; label: string; action: string; onPress: () => void; separator?: boolean }) {
  const styles = useStyles();
  return (
    <Row onPress={onPress} separator={separator} iconInset>
      <View style={styles.glyph}>
        <AppIcon name={icon} size={22} color={color} />
      </View>
      <Text style={styles.statusText}>{label}</Text>
      <Text style={styles.statusAction}>{action}</Text>
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
      <View style={[styles.tabbar, { width: barW, bottom: Math.max(10, insets.bottom - 13) }]} accessibilityRole="tablist">
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
