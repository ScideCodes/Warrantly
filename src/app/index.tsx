import { useCallback, useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addGmailAccount, syncAllAccounts } from '@/accounts';
import { restartIntoUpdate, useUpdateReady } from '@/appUpdate';
import { shouldShowWhatsNew } from '@/whatsNew';
import { maybeAskReview } from '@/rate';
import { runDueBackup } from '@/backup';
import { Sheet, type IconName, type SheetSection } from '@/components/Sheet';
import { formatMoney, WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listAccounts, listReturnPrompts, listWarranties, type Account, type Warranty } from '@/db/repo.ts';
import { rescheduleReminders } from '@/reminders';
import { getUsername } from '@/settings';
import { colors, BUTTON_HEIGHT, BUTTON_RADIUS, CARD_RADIUS, FONT, SPACE } from '@/theme';
import { CATEGORIES, filterWarranties, todayYmd, totalValue, type ListFilter } from '@/warranty';
import { updateWidget } from '@/widget';

type SyncState = { kind: 'idle'; problems: string[] } | { kind: 'syncing'; email: string; done: number; total: number };
// What the filter sheet narrows the list to; one at a time, so it is always clear what is shown.
type Filter = { kind: 'all' } | { kind: 'account'; id: number } | { kind: 'manual' } | { kind: 'category'; key: string } | { kind: 'store'; name: string };
type Group = 'soon' | 'covered' | 'expired';

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
  const listRef = useRef<SectionList<Warranty, { key: Group }>>(null);
  // Three labels side by side need about 300dp of text-scaled width ("Beállítások", "Hozzáadás" at 14–15sp).
  // With less (large system text on a small phone) the bar becomes three full-width rows instead of
  // breaking words or shrinking text. The bar's measured width counts, not the window's: screens are capped
  // at 720dp (see _layout) and lose safe-area insets; the cap is the estimate until the first layout.
  const { width, fontScale } = useWindowDimensions();
  const [barWidth, setBarWidth] = useState<number | null>(null);
  const stacked = (barWidth ?? Math.min(width, 720)) / fontScale < 300;

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
  const total = Object.entries(totalValue([...soon, ...covered])).map(([cur, sum]) => formatMoney(sum, cur, i18n.language)).join(' + ');
  const all: Filter = { kind: 'all' };
  const inAll = (f: Filter) => count('active', f) + count('expired', f);
  const same = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b);
  const filterName = (f: Filter): string =>
    f.kind === 'account' ? (accounts?.find((a) => a.id === f.id)?.email ?? '') : f.kind === 'manual' ? t('home.tabManual') : f.kind === 'category' ? t(`category.${f.key}`) : f.kind === 'store' ? f.name : t('home.menuAll');

  const menuItem = (f: Filter) => ({ key: JSON.stringify(f), label: filterName(f), count: inAll(f), selected: same(f, filter), onPress: () => setFilter(f) });
  const problems = sync.kind === 'idle' ? sync.problems : [];
  const showProblems = () =>
    Alert.alert(t('home.syncFailed', { count: problems.length }), problems.join('\n\n'), [
      { text: t('detail.cancel'), style: 'cancel' },
      { text: t('home.retry'), onPress: () => void runSync() },
    ]);
  const statusRows = [
    attention > 0 && (
      <StatusRow key="attention" icon="alert-circle-outline" color={colors.warning.fg} label={t('home.attentionRow')} action={String(attention)} onPress={() => router.push('/attention')} />
    ),
    problems.length > 0 && (
      <StatusRow key="sync" icon="cloud-offline-outline" color={colors.soon.fg} label={t('home.syncFailed', { count: problems.length })} action={t('home.details')} onPress={showProblems} />
    ),
    updateReady && (
      <StatusRow key="update" icon="arrow-up-circle-outline" color={colors.primary} label={t('home.updateReadyShort')} action={t('home.restart')} onPress={() => void restartIntoUpdate()} />
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
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {t('home.title')}
        </Text>
        <Pressable
          style={[styles.filterButton, filter.kind !== 'all' && styles.filterButtonOn]}
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityState={{ selected: filter.kind !== 'all' }}
        >
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
      {filter.kind !== 'all' && (
        <Pressable style={styles.filterChip} onPress={() => setFilter(all)} accessibilityRole="button" accessibilityLabel={t('home.clearFilter', { name: filterName(filter) })}>
          <Text style={styles.filterChipText}>{t('home.showing', { name: filterName(filter) })}</Text>
          <Ionicons name="close" size={20} color={colors.primary} />
        </Pressable>
      )}
      {sync.kind === 'syncing' && (
        // Routine sync stays quiet: one small line, no banner.
        <View style={styles.syncLine} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.muted} />
          <Text style={styles.syncText}>{sync.total > 0 ? `${sync.email}: ${t('home.progress', { done: sync.done, total: sync.total })}` : t('home.syncing', { email: sync.email })}</Text>
        </View>
      )}
      {statusRows.length > 0 && <View style={styles.statusCard}>{statusRows}</View>}
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
      <View style={stacked ? styles.barStacked : styles.bar} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
        <Pressable
          style={stacked ? styles.barRow : styles.barItem}
          onPress={() => listRef.current?.getScrollResponder()?.scrollTo({ y: 0 })}
          accessibilityRole="button"
          accessibilityState={{ selected: true }}
        >
          <View style={[styles.barIcon, styles.barIconSelected, stacked && styles.barIconRow]}>
            <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.barLabel, stacked && styles.barRowLabel]}>{t('home.title')}</Text>
        </Pressable>
        <Pressable style={stacked ? [styles.barRow, styles.barRowAdd] : styles.barAdd} onPress={() => router.push('/warranty/edit')} accessibilityRole="button" accessibilityLabel={t('home.addLong')}>
          <View style={stacked && styles.barIconRow}>
            <Ionicons name="add" size={28} color={colors.onPrimary} />
          </View>
          <Text style={[styles.barAddText, stacked && styles.barRowLabel]}>{t('home.add')}</Text>
        </Pressable>
        <Pressable style={stacked ? styles.barRow : styles.barItem} onPress={() => router.push('/settings')} accessibilityRole="button">
          <View style={[styles.barIcon, stacked && styles.barIconRow]}>
            <Ionicons name="options-outline" size={24} color={colors.muted} />
          </View>
          <Text style={[styles.barLabel, styles.barLabelIdle, stacked && styles.barRowLabel]}>{t('settings.title')}</Text>
        </Pressable>
      </View>
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('home.filter')} subtitle={total ? t('home.total', { total }) : undefined} sections={menu} />
    </SafeAreaView>
  );
}

// A short row in the status card: icon, plain words, and what a tap does.
function StatusRow({ icon, color, label, action, onPress }: { icon: IconName; color: string; label: string; action: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.statusRow, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.statusText}>{label}</Text>
      <Text style={styles.statusAction}>{action}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: SPACE.screen, paddingBottom: 24, flexGrow: 1 },
  header: { paddingTop: 16, paddingBottom: 4, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flexShrink: 1, fontSize: FONT.title, fontWeight: '700', color: colors.text },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: BUTTON_HEIGHT, paddingHorizontal: 14, borderRadius: BUTTON_RADIUS },
  filterButtonOn: { backgroundColor: colors.primarySoft },
  filterButtonText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  searchBar: { flexDirection: 'row', alignItems: 'center', minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingLeft: 14, paddingRight: 4, gap: 8 },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, minHeight: 48, fontSize: 18, color: colors.text },
  filterChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, minHeight: 44, paddingHorizontal: 14, paddingVertical: 8, borderRadius: BUTTON_RADIUS, backgroundColor: colors.primarySoft, maxWidth: '100%' },
  filterChipText: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.primary },
  syncLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  syncText: { flex: 1, fontSize: 14, color: colors.muted },
  statusCard: { backgroundColor: colors.surface, borderRadius: CARD_RADIUS, paddingHorizontal: SPACE.group },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: BUTTON_HEIGHT, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  statusText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  statusAction: { fontSize: 15, fontWeight: '700', color: colors.primary },
  pressed: { opacity: 0.7 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 24, paddingBottom: 10 },
  // Each group is one white card; rows keep their dividers inside it.
  card: { backgroundColor: colors.surface, paddingHorizontal: 16 },
  cardFirst: { borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS },
  cardLast: { borderBottomLeftRadius: CARD_RADIUS, borderBottomRightRadius: CARD_RADIUS, borderBottomWidth: 0 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  expiredToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: BUTTON_HEIGHT, marginTop: 24, paddingHorizontal: 16, borderRadius: BUTTON_RADIUS, backgroundColor: colors.surface },
  expiredToggleText: { fontSize: 17, fontWeight: '700', color: colors.text },
  empty: { fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 48 },
  connect: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 48 },
  connectTitle: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center' },
  connectBody: { fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  button: { minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_RADIUS, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
  // Bottom bar: every item has an icon and a word, and Add sits where a thumb reaches it.
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', minHeight: 84, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, backgroundColor: colors.surface },
  barItem: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4 },
  barIcon: { width: 64, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  barIconSelected: { backgroundColor: colors.primarySoft },
  barLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  barLabelIdle: { color: colors.muted },
  barAdd: { minWidth: 104, paddingHorizontal: 12, minHeight: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  barAddText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  barStacked: { gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, backgroundColor: colors.surface },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 12, paddingVertical: 4, borderRadius: BUTTON_RADIUS },
  barRowAdd: { backgroundColor: colors.primary },
  barIconRow: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
  barRowLabel: { flexShrink: 1 },
});
