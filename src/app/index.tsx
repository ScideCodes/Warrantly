import { useCallback, useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Redirect, router, useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addGmailAccount, syncAllAccounts } from '@/accounts';
import { restartIntoUpdate, useUpdateReady } from '@/appUpdate';
import { shouldShowWhatsNew } from '@/whatsNew';
import { maybeAskReview } from '@/rate';
import { runDueBackup } from '@/backup';
import { SideMenu, type MenuSection } from '@/components/SideMenu';
import { daysLabel, displayName, formatDate, formatMoney, WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listAccounts, listReturnPrompts, listWarranties, type Account, type Warranty } from '@/db/repo.ts';
import { rescheduleReminders } from '@/reminders';
import { getUsername } from '@/settings';
import { colors, isDark } from '@/theme';
import { CATEGORIES, daysUntil, filterWarranties, todayYmd, totalValue, type ListFilter } from '@/warranty';
import { updateWidget } from '@/widget';

type SyncState = { kind: 'idle'; problems: string[] } | { kind: 'syncing'; email: string; done: number; total: number };
// What the side menu narrows the list to; one at a time, so it is always clear what is shown.
type Filter = { kind: 'all' } | { kind: 'account'; id: number } | { kind: 'manual' } | { kind: 'category'; key: string } | { kind: 'store'; name: string };
type Group = 'soon' | 'covered' | 'expired';

// Warranty list (section 13): one list with no tabs to switch, so anyone can find their way. Expiring
// soon comes first, then the rest that is still covered; expired ones stay folded until asked for.
// A labelled bottom bar (Warranties, Add, Settings) replaces the hidden ☰ menu; Filter keeps the
// account, category and store filters.
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
  const listRef = useRef<SectionList<Warranty, { key: Group }>>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    setAccounts(await listAccounts(db));
    setWarranties(await listWarranties(db, 'complete'));
    setAttention((await listWarranties(db, 'needs_input')).length + (await listReturnPrompts(db)).length);
    // Runs on open, after sync and after edits: the rolling reminder window (section 16).
    rescheduleReminders(db).catch((e) => console.warn('reminders', e)); // must not break the list
    void runDueBackup(db); // section 17: a due backup runs on app open
    updateWidget(db).catch((e) => console.warn('widget', e)); // section 13
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
  const next = query === '' ? (soon[0] ?? covered[0]) : undefined; // the "Next to expire" card
  const total = Object.entries(totalValue([...soon, ...covered])).map(([cur, sum]) => formatMoney(sum, cur, i18n.language)).join(' + ');
  const all: Filter = { kind: 'all' };
  const inAll = (f: Filter) => count('active', f) + count('expired', f);
  const same = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b);
  const filterName = (f: Filter): string =>
    f.kind === 'account' ? (accounts?.find((a) => a.id === f.id)?.email ?? '') : f.kind === 'manual' ? t('home.tabManual') : f.kind === 'category' ? t(`category.${f.key}`) : f.kind === 'store' ? f.name : t('home.menuAll');

  const menuItem = (f: Filter) => ({ key: JSON.stringify(f), label: filterName(f), count: inAll(f), selected: same(f, filter), onPress: () => setFilter(f) });
  const usedCategories = CATEGORIES.filter((c) => warranties.some((w) => w.category === c));
  const stores = [...new Set(warranties.map((w) => w.store_name))].sort((a, b) => a.localeCompare(b));
  const menu: MenuSection[] = [
    { items: [menuItem(all)] },
    ...(accounts?.length
      ? [{ title: t('home.menuAccounts'), items: [...accounts.map((a) => menuItem({ kind: 'account', id: a.id })), menuItem({ kind: 'manual' })] }]
      : []),
    ...(usedCategories.length ? [{ title: t('form.category'), items: usedCategories.map((key) => menuItem({ kind: 'category', key })) }] : []),
    ...(stores.length > 1 ? [{ title: t('home.menuStores'), items: stores.map((name) => menuItem({ kind: 'store', name })) }] : []),
  ];

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {t('home.title')}
        </Text>
        <Pressable style={styles.filterButton} onPress={() => setMenuOpen(true)} accessibilityRole="button" hitSlop={4}>
          <Ionicons name="funnel-outline" size={20} color={colors.primary} />
          <Text style={styles.filterButtonText}>{t('home.filter')}</Text>
        </Pressable>
      </View>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={22} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('home.search')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('home.search')}
          returnKeyType="search"
        />
        {query !== '' && (
          <Pressable style={styles.iconButton} onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('home.clearSearch')}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {next && (
        <Pressable style={styles.hero} onPress={() => router.push(`/warranty/${next.id}`)} accessibilityRole="button">
          <Text style={styles.heroLabel}>{t('home.nextUp')}</Text>
          <Text style={styles.heroName} numberOfLines={2}>
            {displayName(t, next)}
          </Text>
          <View style={styles.heroRow}>
            <Text style={styles.heroDays}>{daysLabel(t, daysUntil(next.end_date, today))}</Text>
            <Text style={styles.heroMeta} numberOfLines={1}>
              {next.store_name} · {t('home.endsOn', { date: formatDate(next.end_date, i18n.language) })}
            </Text>
          </View>
        </Pressable>
      )}
      {filter.kind !== 'all' && (
        <Pressable style={styles.filterPill} onPress={() => setFilter(all)} accessibilityRole="button" accessibilityLabel={t('home.clearFilter', { name: filterName(filter) })}>
          <Text style={styles.filterText} numberOfLines={1}>
            {t('home.showing', { name: filterName(filter) })}
          </Text>
          <Text style={styles.filterClose}>✕</Text>
        </Pressable>
      )}
      {updateReady && (
        <Pressable style={styles.banner} onPress={() => void restartIntoUpdate()} accessibilityRole="button">
          <Text style={styles.bannerText}>{t('home.updateReady')} ›</Text>
        </Pressable>
      )}
      {attention > 0 && (
        <Link href="/attention" asChild>
          <Pressable style={styles.banner} accessibilityRole="button">
            <Text style={styles.bannerText}>{t('home.attention', { count: attention })} ›</Text>
          </Pressable>
        </Link>
      )}
      {sync.kind === 'syncing' && sync.total > 0 && (
        <Text style={styles.status}>
          {sync.email}: {t('home.progress', { done: sync.done, total: sync.total })}
        </Text>
      )}
      {sync.kind === 'idle' &&
        sync.problems.map((p) => (
          <Text key={p} style={styles.detail}>
            {p}
          </Text>
        ))}
      {total !== '' && <Text style={styles.total}>{t('home.total', { total })}</Text>}
    </View>
  );

  const groupStyle: Record<Group, { icon: 'time-outline' | 'shield-checkmark-outline' | 'archive-outline'; color: string }> = {
    soon: { icon: 'time-outline', color: colors.soon.fg },
    covered: { icon: 'shield-checkmark-outline', color: colors.primary },
    expired: { icon: 'archive-outline', color: colors.muted },
  };
  const groupTitle = { soon: 'home.sectionSoon', covered: 'home.sectionCovered', expired: 'home.sectionExpired' } as const;

  const empty = accounts === null ? undefined : accounts.length || warranties.length ? (
    <Text style={styles.empty}>
      {sync.kind === 'syncing' ? t('home.syncing', { email: sync.email }) : (query || filter.kind !== 'all') && !expired.length ? t('home.noMatch') : t('home.empty_active')}
    </Text>
  ) : (
    <View style={styles.connect}>
      <Text style={styles.connectTitle}>{t('home.emptyTitle')}</Text>
      <Text style={styles.connectBody}>{t('home.emptyBody')}</Text>
      <Pressable style={styles.button} onPress={connect} accessibilityRole="button">
        <Text style={styles.buttonText}>{t('home.connectGmail')}</Text>
      </Pressable>
    </View>
  );

  const footer =
    expired.length > 0 && query === '' ? (
      <Pressable style={styles.expiredToggle} onPress={() => setShowExpired((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showExpired }}>
        <Text style={styles.expiredToggleText}>{showExpired ? t('home.hideExpired') : t('home.showExpired', { count: expired.length })}</Text>
        <Ionicons name={showExpired ? 'chevron-up' : 'chevron-down'} size={22} color={colors.text} />
      </Pressable>
    ) : undefined;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(w) => String(w.id)}
        renderItem={({ item, index, section }) => (
          <WarrantyRow
            warranty={item}
            style={[styles.card, index === 0 && styles.cardFirst, index === { soon, covered, expired }[section.key].length - 1 && styles.cardLast]}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Ionicons name={groupStyle[section.key].icon} size={22} color={groupStyle[section.key].color} />
            <Text style={[styles.sectionTitle, { color: groupStyle[section.key].color }]} accessibilityRole="header">
              {t(groupTitle[section.key], { count: { soon, covered, expired }[section.key].length })}
            </Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={sync.kind === 'syncing'} onRefresh={() => {
            void runSync();
          }} enabled={!!accounts?.length} colors={[colors.primary]} />
        }
      />
      <View style={styles.bar}>
        <Pressable
          style={styles.barItem}
          onPress={() => listRef.current?.getScrollResponder()?.scrollTo({ y: 0 })}
          accessibilityRole="button"
          accessibilityState={{ selected: true }}
        >
          <View style={[styles.barIcon, styles.barIconSelected]}>
            <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
          </View>
          <Text style={styles.barLabel}>{t('home.title')}</Text>
        </Pressable>
        <Pressable style={styles.barAdd} onPress={() => router.push('/warranty/edit')} accessibilityRole="button" accessibilityLabel={t('home.addLong')}>
          <Ionicons name="add" size={28} color={colors.onPrimary} />
          <Text style={styles.barAddText}>{t('home.add')}</Text>
        </Pressable>
        <Pressable style={styles.barItem} onPress={() => router.push('/settings')} accessibilityRole="button">
          <View style={styles.barIcon}>
            <Ionicons name="options-outline" size={24} color={colors.muted} />
          </View>
          <Text style={[styles.barLabel, styles.barLabelIdle]}>{t('settings.title')}</Text>
        </Pressable>
      </View>
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} title={t('home.filter')} sections={menu} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 20, paddingBottom: 24, flexGrow: 1 },
  header: { paddingTop: 16, paddingBottom: 8, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1, borderColor: colors.border },
  filterButtonText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  searchBar: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingLeft: 14, paddingRight: 4, gap: 8 },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, minHeight: 48, fontSize: 18, color: colors.text },
  filterPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: colors.primary, maxWidth: '100%' },
  filterText: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.onPrimary },
  filterClose: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  banner: { backgroundColor: colors.banner, borderRadius: 12, padding: 14, minHeight: 52, justifyContent: 'center' },
  bannerText: { fontSize: 16, fontWeight: '600', color: colors.warning.fg },
  status: { fontSize: 14, color: colors.muted },
  detail: { fontSize: 14, color: colors.muted },
  total: { fontSize: 14, color: colors.muted },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 24, paddingBottom: 10 },
  // Each group is one white card; rows keep their dividers inside it.
  card: { backgroundColor: colors.surface, paddingHorizontal: 16 },
  cardFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  cardLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20, borderBottomWidth: 0 },
  hero: { gap: 4, padding: 20, borderRadius: 20, backgroundColor: isDark ? colors.surface : colors.primary },
  heroLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: isDark ? colors.muted : colors.onPrimary },
  heroName: { fontSize: 22, fontWeight: '700', color: isDark ? colors.text : colors.onPrimary },
  heroRow: { gap: 2, marginTop: 4 },
  heroDays: { fontSize: 26, fontWeight: '700', color: isDark ? colors.soon.fg : colors.onPrimary },
  heroMeta: { fontSize: 15, color: isDark ? colors.muted : colors.onPrimary },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  expiredToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, marginTop: 24, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.surface },
  expiredToggleText: { fontSize: 17, fontWeight: '700', color: colors.text },
  empty: { fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 48 },
  connect: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 48 },
  connectTitle: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center' },
  connectBody: { fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
  // Bottom bar: every item has an icon and a word, and Add sits where a thumb reaches it.
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', minHeight: 84, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, backgroundColor: colors.surface },
  barItem: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4 },
  barIcon: { width: 64, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  barIconSelected: { backgroundColor: colors.primarySoft },
  barLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  barLabelIdle: { color: colors.muted },
  barAdd: { width: 104, minHeight: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  barAddText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
});
