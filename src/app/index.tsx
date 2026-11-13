import { useCallback, useEffect, useRef, useState } from 'react';
import AppIcon from '@/components/Icon';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
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
import { BAR_H, colors, CONTROL_H, FIELD_RADIUS, gutter, isDark, RADIUS, SPRING, SPRING_BOUNCE, TYPE } from '@/theme';
import { Button, glass, GlassButton, Group, reduceMotion, Row, SectionHeader } from '@/components/ui';
import { LargeTitle, NavBar, useScrollEdge } from '@/components/Page';
import { showAlert } from '@/components/Dialog';
import { CATEGORIES, filterWarranties, todayYmd, totalValue, type ListFilter } from '@/warranty';
import { updateWidget } from '@/widget';

type SyncState = { kind: 'idle'; problems: string[] } | { kind: 'syncing'; email: string; done: number; total: number };
// What the filter sheet narrows the list to; one at a time, so it is always clear what is shown.
type Filter = { kind: 'all' } | { kind: 'account'; id: number } | { kind: 'manual' } | { kind: 'category'; key: string } | { kind: 'store'; name: string };
type GroupKey = 'soon' | 'covered' | 'expired';
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList<Warranty, { key: GroupKey }>);

// Warranty list (section 13): one list with no tabs to switch, so anyone can find their way. Expiring
// soon comes first, then the rest that is still covered; expired ones stay folded until asked for.
// A labelled bottom bar (Warranties, Add, Settings); Filter opens a sheet with the account, category and
// store filters. Above the list only short status rows, and only when there is something to act on.
export default function Home() {
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
  const listRef = useRef<SectionList<Warranty, { key: GroupKey }>>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The tab bar minimizes to the current tab while scrolling down (chrome.js lines 216-232): after 40dp of travel
  // down, past 60dp; it returns after 24dp of travel up or near the top.
  const [compact, setCompact] = useState(false);
  const scroll = useRef({ last: 0, travel: 0 });
  const edge = useScrollEdge((y) => {
    const s = scroll.current;
    const delta = y - s.last;
    s.last = y;
    s.travel = Math.sign(delta) === Math.sign(s.travel) ? s.travel + delta : delta;
    if (y < 60 || s.travel < -24) setCompact(false);
    else if (s.travel > 40) setCompact(true);
  });

  const load = useCallback(async () => {
    const db = await getDb();
    setAccounts(await listAccounts(db));
    setWarranties(await listWarranties(db, 'complete'));
    setAttention((await listWarranties(db, 'needs_input')).length + (await listReturnPrompts(db)).length);
    // Runs on open, after sync and after edits: the rolling reminder window (section 16).
    rescheduleReminders(db).catch((e) => console.warn('reminders', e)); // must not break the list
    void runDueBackup(db); // section 17: a due backup runs on app open
    updateWidget(db).catch((e) => console.warn('widget', e)); // section 13
    // Product pictures (when turned on): a few lookups after the list is shown, never from the rows themselves.
    void runPictureLookups(db).then(async (changed) => changed && setWarranties(await listWarranties(db, 'complete')));
  }, []);

  const runSync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    const db = await getDb();
    const problems = await syncAllAccounts(db, (email, done, total) => setSync({ kind: 'syncing', email, done, total }));
    setSync({ kind: 'idle', problems });
    syncing.current = false;
    await load();
  }, [load]);

  // Reload when coming back from another screen; sync once on app open (section 7).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    if (name) void runSync();
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

  if (!name) return <Redirect href="/onboarding" />;

  const today = todayYmd();
  // Section 13: search (product, store) and the menu's filter, in each group.
  const listFilter = (v: 'active' | 'soon' | 'expired', f: Filter): ListFilter => ({
    query,
    tab: v === 'expired' ? 'expired' : 'active',
    soon: v === 'soon',
    account: f.kind === 'account' ? f.id : f.kind === 'manual' ? 'manual' : 'all',
    category: f.kind === 'category' ? f.key : null,
    store: f.kind === 'store' ? f.name : null,
  });
  const count = (v: 'active' | 'expired', f: Filter) => filterWarranties(warranties, { ...listFilter(v, f), query: '' }, today).length;
  const soon = filterWarranties(warranties, listFilter('soon', filter), today);
  const covered = filterWarranties(warranties, listFilter('active', filter), today).filter((w) => !soon.includes(w));
  const expired = filterWarranties(warranties, listFilter('expired', filter), today);
  const expiredOpen = showExpired || query !== ''; // a search looks everywhere
  const sections = [
    { key: 'soon' as const, data: soon },
    { key: 'covered' as const, data: covered },
    { key: 'expired' as const, data: expiredOpen ? expired : [] },
  ].filter((s) => s.data.length > 0);
  const total = Object.entries(totalValue([...soon, ...covered])).map(([cur, sum]) => formatMoney(sum, cur, i18n.language)).join(' + ');
  const all: Filter = { kind: 'all' };
  const inAll = (f: Filter) => count('active', f) + count('expired', f);
  const same = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b);
  const filterName = (f: Filter): string =>
    f.kind === 'account' ? (accounts?.find((a) => a.id === f.id)?.email ?? '') : f.kind === 'manual' ? t('home.tabManual') : f.kind === 'category' ? t(`category.${f.key}`) : f.kind === 'store' ? f.name : t('home.menuAll');

  const menuItem = (f: Filter) => ({ key: JSON.stringify(f), label: filterName(f), count: inAll(f), selected: same(f, filter), onPress: () => setFilter(f) });
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
  const usedCategories = CATEGORIES.filter((c) => warranties.some((w) => w.category === c));
  const stores = [...new Set(warranties.map((w) => w.store_name))].sort((a, b) => a.localeCompare(b));
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
          <Text style={styles.syncText}>{sync.total > 0 ? `${sync.email}: ${t('home.progress', { done: sync.done, total: sync.total })}` : t('home.syncing', { email: sync.email })}</Text>
        </View>
      )}
      {statusRows.length > 0 && <Group style={styles.statusCard}>{statusRows}</Group>}
    </View>
  );

  const groupTitle = { soon: 'home.sectionSoon', covered: 'home.sectionCovered', expired: 'home.sectionExpired' } as const;

  const empty = accounts === null ? undefined : accounts.length || warranties.length ? (
    <Text style={styles.empty}>
      {sync.kind === 'syncing' ? t('home.syncing', { email: sync.email }) : (query || filter.kind !== 'all') && !expired.length ? t('home.noMatch') : t('home.empty_active')}
    </Text>
  ) : (
    <View style={styles.connect}>
      <Text style={styles.connectTitle}>{t('home.emptyTitle')}</Text>
      <Text style={styles.connectBody}>{t('home.emptyBody')}</Text>
      <Button title={t('home.connectGmail')} onPress={connect} />
    </View>
  );

  const footer =
    expired.length > 0 && query === '' ? (
      <Group style={styles.expiredToggle}>
        <Row onPress={() => setShowExpired((v) => !v)} accessibilityState={{ expanded: showExpired }}>
          <Text style={styles.expiredToggleText}>{showExpired ? t('home.hideExpired') : t('home.showExpired', { count: expired.length })}</Text>
          <AppIcon name={showExpired ? 'chevron-up' : 'chevron-down'} size={16} color={colors.chevron} />
        </Row>
      </Group>
    ) : undefined;

  const lists = { soon, covered, expired };
  return (
    <View style={styles.screen}>
      <AnimatedSectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(w: Warranty) => String(w.id)}
        renderItem={({ item, index, section }: { item: Warranty; index: number; section: { key: GroupKey } }) => (
          <WarrantyRow
            warranty={item}
            separator={index > 0}
            style={[styles.card, index === 0 && styles.cardFirst, index === lists[section.key].length - 1 && styles.cardLast]}
          />
        )}
        renderSectionHeader={({ section }: { section: { key: GroupKey } }) => <SectionHeader title={t(groupTitle[section.key], { count: lists[section.key].length })} />}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + BAR_H, paddingHorizontal: gutter(width), paddingBottom: 88 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
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
        compact={compact}
        onExpand={() => setCompact(false)}
      />
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('home.filter')} subtitle={total ? t('home.total', { total }) : undefined} sections={menu} />
    </View>
  );
}

// A short row in the status card: glyph, plain words, and what a tap does (in link colour).
function StatusRow({ icon, color, label, action, onPress, separator }: { icon: IconName; color: string; label: string; action: string; onPress: () => void; separator?: boolean }) {
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
// The reference's floating tab bar (ios.css lines 189-215): min(368, width - 42) wide, 4dp in, 31 radius,
// 54dp tabs with a 24dp glyph over a 10/12 semibold label that stops growing at 130%. The current tab sits
// on the --select lens with a tint glyph and tint-ink label. Glass falls back to --material-solid.
// Compact (chrome.js lines 132-151): the surface narrows to 72/54 of the tab height, the lens to 64/54, both
// centred; the current tab slides to the centre and every label and other tab fades out. A tap only expands it.
// The reference scales with transforms and elliptical radii; React Native has no elliptical radius, so the
// childless surface and lens animate their width instead, on the same spring.
function TabBar({ tabs, current, compact, onExpand }: { tabs: Tab[]; current: string; compact: boolean; onExpand: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tabH, setTabH] = useState(54);
  const [reader, setReader] = useState(false);
  const p = useState(() => new Animated.Value(0))[0];
  const small = compact && !reader; // screen-reader users keep every tab, as the reference expands on focus
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setReader);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setReader);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (reduceMotion()) p.setValue(small ? 1 : 0);
    else Animated.spring(p, { toValue: small ? 1 : 0, useNativeDriver: false, ...SPRING }).start();
  }, [small, p]);
  const barW = Math.min(368, width - 42);
  const tabW = (barW - 8) / tabs.length;
  const at = Math.max(0, tabs.findIndex((tab) => tab.key === current));
  const tabX = 4 + at * tabW;
  const surfaceW = Math.min(barW, (tabH * 72) / 54);
  const lensW = Math.min((tabH * 64) / 54, tabW);
  const mix = (a: number, b: number) => p.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
  const fade = p.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <>
      <View style={[styles.scrollEdge, { height: 80 + insets.bottom }]} pointerEvents="none" />
      <View style={[styles.tabbar, { width: barW, bottom: Math.max(10, insets.bottom - 13) }]} accessibilityRole="tablist" pointerEvents="box-none">
        <Animated.View style={[styles.tabSurface, glass(), { boxShadow: colors.tabbarEdge, width: mix(barW, surfaceW), left: mix(0, (barW - surfaceW) / 2) }]} pointerEvents="none" />
        <Animated.View style={[styles.lens, { top: 4, height: tabH, width: mix(tabW, lensW), left: mix(tabX, (barW - lensW) / 2) }]} pointerEvents="none" />
        {tabs.map((tab, i) => {
          const on = i === at;
          return (
            <Animated.View
              key={tab.key}
              style={[styles.tabSlot, on ? { transform: [{ translateX: mix(0, (barW - tabW) / 2 - tabX) }] } : { opacity: fade }]}
              pointerEvents={small && !on ? 'none' : 'auto'}
              onLayout={on ? (e) => setTabH(e.nativeEvent.layout.height) : undefined}
            >
              <TabButton tab={small && on ? { ...tab, onPress: onExpand } : tab} on={on} labelOpacity={fade} />
            </Animated.View>
          );
        })}
      </View>
    </>
  );
}

// Tab glyphs shrink to .86 while held and settle back on the bouncier spring.
function TabButton({ tab, on, labelOpacity }: { tab: Tab; on: boolean; labelOpacity: Animated.AnimatedInterpolation<number> }) {
  const scale = useState(() => new Animated.Value(1))[0];
  const [labelHeight, setLabelHeight] = useState(12);
  const press = (v: number) => {
    if (!reduceMotion()) Animated.spring(scale, { toValue: v, useNativeDriver: true, ...SPRING_BOUNCE }).start();
  };
  return (
    <Pressable
      testID={`tab-${tab.key}`}
      style={styles.tab}
      onPress={tab.onPress}
      onPressIn={() => press(0.86)}
      onPressOut={() => press(1)}
      accessibilityRole="tab"
      accessibilityLabel={tab.accessibilityLabel ?? tab.label}
      accessibilityState={{ selected: on }}
    >
      {/* The faded label still takes space. Move the glyph by half that space plus
          the gap so the compact tab is visually centered, at every label scale. */}
      <Animated.View style={{ transform: [{ scale }, { translateY: labelOpacity.interpolate({ inputRange: [0, 1], outputRange: [(labelHeight + 2) / 2, 0] }) }] }}>
        <AppIcon name={on && tab.iconOn ? tab.iconOn : tab.icon} size={24} color={on ? colors.tint : colors.ink} />
      </Animated.View>
      <Animated.Text onLayout={(e) => setLabelHeight(e.nativeEvent.layout.height)} style={[styles.tabLabel, on && { color: colors.tintInk }, { opacity: labelOpacity }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {tab.label}
      </Animated.Text>
    </Pressable>
  );
}

const rgb = isDark ? '0,0,0' : '242,242,247';
const styles = StyleSheet.create({
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
  expiredToggle: { marginTop: 28 },
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
    opacity: isDark ? 0.35 : 1,
    backgroundImage: `linear-gradient(rgba(${rgb},0) 0%, rgba(${rgb},0.82) 55%, rgba(${rgb},1) 100%)`,
  },
  tabbar: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', padding: 4 },
  tabSurface: { position: 'absolute', top: 0, bottom: 0, borderRadius: 31 },
  lens: { position: 'absolute', borderRadius: 28, backgroundColor: colors.select },
  tabSlot: { flex: 1, minWidth: 0 },
  tab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 28, paddingHorizontal: 2 },
  tabLabel: { ...TYPE.tab, color: colors.ink, maxWidth: '100%' },
});
