import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Redirect, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addGmailAccount, syncAllAccounts } from '@/accounts';
import { runDueBackup } from '@/backup';
import { WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listAccounts, listWarranties, type Account, type Warranty } from '@/db/repo.ts';
import { rescheduleReminders } from '@/reminders';
import { getUsername } from '@/settings';
import { colors } from '@/theme';
import { filterWarranties, todayYmd } from '@/warranty';

type SyncState = { kind: 'idle'; problems: string[] } | { kind: 'syncing'; email: string; done: number; total: number };
type Filter = 'all' | 'manual' | number; // an account id

// Warranty list (section 13): one tab per mail account plus Manual (section 15), each with Active and
// Expired (section 10), sorted by soonest expiry.
export default function Home() {
  const { t } = useTranslation();
  const name = getUsername();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<'active' | 'expired'>('active');
  const [query, setQuery] = useState('');
  const [store, setStore] = useState<string | null>(null);
  const [soon, setSoon] = useState(false);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [attention, setAttention] = useState(0);
  const [sync, setSync] = useState<SyncState>({ kind: 'idle', problems: [] });
  const syncing = useRef(false);

  const load = useCallback(async () => {
    const db = await getDb();
    setAccounts(await listAccounts(db));
    setWarranties(await listWarranties(db, 'complete'));
    setAttention((await listWarranties(db, 'needs_input')).length);
    // Runs on open, after sync and after edits: the rolling reminder window (section 16).
    rescheduleReminders(db).catch((e) => console.warn('reminders', e)); // must not break the list
    void runDueBackup(db); // section 17: a due backup runs on app open
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    try {
      if (await addGmailAccount(await getDb())) await runSync();
    } catch (e) {
      setSync({ kind: 'idle', problems: [e instanceof Error ? e.message : String(e)] });
    }
  }

  if (!name) return <Redirect href="/onboarding" />;

  const today = todayYmd();
  // Section 15: one tab per account plus the general Manual tab, shown once an account is connected.
  const groups: Filter[] = accounts?.length ? [...accounts.map((a) => a.id), 'manual'] : [];
  // Section 13: search (product, store) and filters, in both Active and Expired.
  const shown = filterWarranties(warranties, { query, store, soon, account: filter, tab }, today);
  const stores = [...new Set(filterWarranties(warranties, { query: '', store: null, soon: false, account: filter, tab }, today).map((w) => w.store_name))].sort();
  const label = (f: Filter) => (f === 'all' ? t('home.tabAll') : f === 'manual' ? t('home.tabManual') : (accounts?.find((a) => a.id === f)?.email ?? ''));

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.greeting} accessibilityRole="header">
          {t('home.greeting', { name })}
        </Text>
        <Link href="/warranty/edit" asChild>
          <Pressable style={styles.addButton} accessibilityRole="button">
            <Text style={styles.addText}>+ {t('home.add')}</Text>
          </Pressable>
        </Link>
        <Link href="/settings" asChild>
          <Pressable style={styles.settingsButton} accessibilityRole="button" accessibilityLabel={t('settings.title')}>
            <Text style={styles.settingsText}>⚙</Text>
          </Pressable>
        </Link>
      </View>
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
      {warranties.length > 0 && (
        <>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={t('home.search')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('home.search')}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {tab === 'active' && (
              <Pressable style={[styles.chip, soon && styles.chipSelected]} onPress={() => setSoon(!soon)} accessibilityRole="checkbox" accessibilityState={{ checked: soon }}>
                <Text style={[styles.chipText, soon && styles.chipTextSelected]}>{t('home.soon')}</Text>
              </Pressable>
            )}
            {stores.length > 1 &&
              stores.map((name) => (
                <Pressable
                  key={name}
                  style={[styles.chip, store === name && styles.chipSelected]}
                  onPress={() => setStore(store === name ? null : name)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: store === name }}
                >
                  <Text style={[styles.chipText, store === name && styles.chipTextSelected]} numberOfLines={1}>
                    {name}
                  </Text>
                </Pressable>
              ))}
          </ScrollView>
        </>
      )}
      {groups.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
          {(['all', ...groups] as Filter[]).map((f) => (
            <Pressable key={String(f)} style={[styles.chip, filter === f && styles.chipSelected]} onPress={() => setFilter(f)} accessibilityRole="tab" accessibilityState={{ selected: filter === f }}>
              <Text style={[styles.chipText, filter === f && styles.chipTextSelected]} numberOfLines={1}>
                {label(f)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {(accounts?.length || warranties.length > 0) && (
        <View style={styles.tabs} accessibilityRole="tablist">
          {(['active', 'expired'] as const).map((key) => (
            <Pressable
              key={key}
              style={[styles.tab, tab === key && styles.tabSelected]}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextSelected]}>{t(key === 'active' ? 'home.tabActive' : 'home.tabExpired')}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const empty = accounts === null ? undefined : accounts.length ? (
    <Text style={styles.empty}>
      {sync.kind === 'syncing'
        ? t('home.syncing', { email: sync.email })
        : query || store || soon
          ? t('home.noMatch')
          : t(tab === 'active' ? 'home.emptyActive' : 'home.emptyExpired')}
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
        refreshControl={
          <RefreshControl refreshing={sync.kind === 'syncing'} onRefresh={() => {
            void runSync();
          }} enabled={!!accounts?.length} colors={[colors.primary]} />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1 },
  header: { paddingTop: 24, paddingBottom: 8, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  greeting: { flex: 1, fontSize: 28, fontWeight: '700', color: colors.text },
  addButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center' },
  addText: { fontSize: 15, fontWeight: '600', color: colors.onPrimary },
  settingsButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontSize: 24, color: colors.text },
  banner: { backgroundColor: colors.banner, borderRadius: 8, padding: 12, minHeight: 48, justifyContent: 'center' },
  bannerText: { fontSize: 16, fontWeight: '600', color: colors.warning.fg },
  status: { fontSize: 14, color: colors.muted },
  chips: { gap: 8 },
  chip: { minHeight: 36, maxWidth: 220, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontSize: 14, color: colors.text },
  search: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 22, paddingHorizontal: 16, fontSize: 16, color: colors.text },
  chipTextSelected: { color: colors.background, fontWeight: '600' },
  detail: { fontSize: 12, color: colors.muted },
  tabs: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  tabSelected: { backgroundColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: '600', color: colors.text },
  tabTextSelected: { color: colors.onPrimary },
  empty: { fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 48 },
  connect: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 48 },
  connectTitle: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center' },
  connectBody: { fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
});
