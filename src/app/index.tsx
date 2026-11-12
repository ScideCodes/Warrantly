import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Redirect, router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addGmailAccount, syncAllAccounts } from '@/accounts';
import { restartIntoUpdate, useUpdateReady } from '@/appUpdate';
import { shouldShowWhatsNew } from '@/whatsNew';
import { maybeAskReview } from '@/rate';
import { runDueBackup } from '@/backup';
import { SideMenu, type MenuSection } from '@/components/SideMenu';
import { formatMoney, WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listAccounts, listReturnPrompts, listWarranties, type Account, type Warranty } from '@/db/repo.ts';
import { rescheduleReminders } from '@/reminders';
import { getUsername } from '@/settings';
import { colors } from '@/theme';
import { CATEGORIES, filterWarranties, todayYmd, totalValue, type ListFilter } from '@/warranty';
import { updateWidget } from '@/widget';

type SyncState = { kind: 'idle'; problems: string[] } | { kind: 'syncing'; email: string; done: number; total: number };
// What the side menu narrows the list to; one at a time, so it is always clear what is shown.
type Filter = { kind: 'all' } | { kind: 'account'; id: number } | { kind: 'manual' } | { kind: 'category'; key: string } | { kind: 'store'; name: string };
type View3 = 'active' | 'soon' | 'expired';

// Warranty list (section 13), laid out like Gmail so anyone can find their way: a search bar with the
// menu (accounts, Manual, categories, stores, settings) on the left and the user on the right, three big
// tabs, the list sorted by soonest expiry, and one large Add button.
export default function Home() {
  const { t, i18n } = useTranslation();
  const name = getUsername();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [view, setView] = useState<View3>('active');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [attention, setAttention] = useState(0);
  const [sync, setSync] = useState<SyncState>({ kind: 'idle', problems: [] });
  const updateReady = useUpdateReady();
  const syncing = useRef(false);

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
  // Section 13: search (product, store) and the menu's filter, in each tab.
  const listFilter = (v: View3, f: Filter): ListFilter => ({
    query,
    tab: v === 'expired' ? 'expired' : 'active',
    soon: v === 'soon',
    account: f.kind === 'account' ? f.id : f.kind === 'manual' ? 'manual' : 'all',
    category: f.kind === 'category' ? f.key : null,
    store: f.kind === 'store' ? f.name : null,
  });
  const count = (v: View3, f: Filter = filter) => filterWarranties(warranties, { ...listFilter(v, f), query: '' }, today).length;
  const shown = filterWarranties(warranties, listFilter(view, filter), today);
  const total = Object.entries(totalValue(shown)).map(([cur, sum]) => formatMoney(sum, cur, i18n.language)).join(' + ');
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
    {
      items: [
        { key: 'attention', label: t('attention.title'), count: attention, onPress: () => router.push('/attention') },
        { key: 'ignored', label: t('ignored.title'), onPress: () => router.push('/ignored') },
        { key: 'settings', label: t('settings.title'), onPress: () => router.push('/settings') },
        { key: 'help', label: t('help.title'), onPress: () => router.push('/help') },
      ],
    },
  ];

  const header = (
    <View style={styles.header}>
      <View style={styles.searchBar}>
        <Pressable style={styles.iconButton} onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel={t('home.menu')} hitSlop={4}>
          <Text style={styles.menuIcon}>☰</Text>
        </Pressable>
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
            <Text style={styles.clearIcon}>✕</Text>
          </Pressable>
        )}
        <Pressable style={styles.avatar} onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('settings.title')}>
          <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text>
        </Pressable>
      </View>
      {filter.kind !== 'all' && (
        <Pressable style={styles.filterPill} onPress={() => setFilter(all)} accessibilityRole="button" accessibilityLabel={t('home.clearFilter', { name: filterName(filter) })}>
          <Text style={styles.filterText} numberOfLines={1}>
            {t('home.showing', { name: filterName(filter) })}
          </Text>
          <Text style={styles.filterClose}>✕</Text>
        </Pressable>
      )}
      {(accounts?.length || warranties.length > 0) && (
        <View style={styles.tabs} accessibilityRole="tablist">
          {(['active', 'soon', 'expired'] as const).map((key) => (
            <Pressable
              key={key}
              style={[styles.tab, view === key && styles.tabSelected]}
              onPress={() => setView(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === key }}
            >
              <Text style={[styles.tabText, view === key && styles.tabTextSelected]} numberOfLines={2}>
                {t(`home.view_${key}`)}
              </Text>
              <Text style={[styles.tabCount, view === key && styles.tabTextSelected]}>{count(key)}</Text>
            </Pressable>
          ))}
        </View>
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

  const empty = accounts === null ? undefined : accounts.length || warranties.length ? (
    <Text style={styles.empty}>
      {sync.kind === 'syncing'
        ? t('home.syncing', { email: sync.email })
        : query || filter.kind !== 'all'
          ? t('home.noMatch')
          : t(`home.empty_${view}`)}
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

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <FlatList
        data={shown}
        keyExtractor={(w) => String(w.id)}
        renderItem={({ item }) => <WarrantyRow warranty={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={sync.kind === 'syncing'} onRefresh={() => {
            void runSync();
          }} enabled={!!accounts?.length} colors={[colors.primary]} />
        }
      />
      <Pressable style={styles.fab} onPress={() => router.push('/warranty/edit')} accessibilityRole="button" accessibilityLabel={t('home.addLong')}>
        <Text style={styles.fabText}>+ {t('home.add')}</Text>
      </Pressable>
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} title="Warrantly" subtitle={t('home.greeting', { name })} sections={menu} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 16, paddingBottom: 112, flexGrow: 1 },
  header: { paddingTop: 12, paddingBottom: 8, gap: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 28, backgroundColor: colors.surface, paddingHorizontal: 6, gap: 4 },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  menuIcon: { fontSize: 24, color: colors.text },
  clearIcon: { fontSize: 18, color: colors.muted },
  searchInput: { flex: 1, minHeight: 48, fontSize: 17, color: colors.text },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.onPrimary },
  filterPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.primary, maxWidth: '100%' },
  filterText: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.onPrimary },
  filterClose: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 6 },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Two lines instead of "Expiring s…": a third of a 360dp screen is too narrow for the label.
  tabText: { fontSize: 15, lineHeight: 19, fontWeight: '600', color: colors.text, textAlign: 'center' },
  tabCount: { fontSize: 13, color: colors.muted },
  tabTextSelected: { color: colors.onPrimary },
  banner: { backgroundColor: colors.banner, borderRadius: 12, padding: 14, minHeight: 52, justifyContent: 'center' },
  bannerText: { fontSize: 16, fontWeight: '600', color: colors.warning.fg },
  status: { fontSize: 14, color: colors.muted },
  detail: { fontSize: 12, color: colors.muted },
  total: { fontSize: 14, color: colors.muted },
  empty: { fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 48 },
  connect: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 48 },
  connectTitle: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center' },
  connectBody: { fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
  fab: {
    position: 'absolute', right: 20, bottom: 28, minHeight: 60, paddingHorizontal: 24, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  fabText: { fontSize: 18, fontWeight: '700', color: colors.onPrimary },
});
