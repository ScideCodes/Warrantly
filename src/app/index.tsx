import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Redirect, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listWarranties, type Warranty } from '@/db/repo.ts';
import { syncAccount } from '@/db/sync.ts';
import { connectedEmail, connectGmail, getAccessToken } from '@/google';
import { gmailProvider } from '@/mail/gmail.ts';
import { rescheduleReminders } from '@/reminders';
import { getUsername } from '@/settings';
import { colors } from '@/theme';
import { daysUntil, todayYmd } from '@/warranty';

type SyncState =
  | { kind: 'idle' }
  | { kind: 'syncing'; done: number; total: number }
  | { kind: 'partial'; count: number; detail: string }
  | { kind: 'error'; detail: string };

// Warranty list (section 13): Active and Expired tabs, sorted by soonest expiry.
export default function Home() {
  const { t } = useTranslation();
  const name = getUsername();
  const [email, setEmail] = useState(connectedEmail);
  const [tab, setTab] = useState<'active' | 'expired'>('active');
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [attention, setAttention] = useState(0);
  const [sync, setSync] = useState<SyncState>({ kind: 'idle' });
  const syncing = useRef(false);

  const load = useCallback(async () => {
    const db = await getDb();
    setWarranties(await listWarranties(db, 'complete'));
    setAttention((await listWarranties(db, 'needs_input')).length);
    // Runs on open, after sync and after edits: the rolling reminder window (section 16).
    rescheduleReminders(db).catch((e) => console.warn('reminders', e)); // must not break the list
  }, []);

  const runSync = useCallback(
    async (account: string) => {
      if (syncing.current) return;
      syncing.current = true;
      try {
        const db = await getDb();
        setSync({ kind: 'syncing', done: 0, total: 0 });
        const failed = await syncAccount(db, gmailProvider(getAccessToken), account, (done, total) => {
          setSync({ kind: 'syncing', done, total });
        });
        setSync(failed.length ? { kind: 'partial', count: failed.length, detail: failed[0].error } : { kind: 'idle' });
      } catch (e) {
        setSync({ kind: 'error', detail: e instanceof Error ? e.message : String(e) });
      } finally {
        syncing.current = false;
        await load();
      }
    },
    [load],
  );

  // Reload when coming back from another screen; sync once on app open (section 7).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runSync sets state only after awaiting the database
    if (name && email) void runSync(email);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    try {
      const account = await connectGmail();
      if (!account) return; // user cancelled the Google dialog
      setEmail(account);
      await runSync(account);
    } catch (e) {
      setSync({ kind: 'error', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!name) return <Redirect href="/onboarding" />;

  const today = todayYmd();
  const shown = warranties.filter((w) => (daysUntil(w.end_date, today) >= 0) === (tab === 'active'));

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
      </View>
      {attention > 0 && (
        <Link href="/attention" asChild>
          <Pressable style={styles.banner} accessibilityRole="button">
            <Text style={styles.bannerText}>{t('home.attention', { count: attention })} ›</Text>
          </Pressable>
        </Link>
      )}
      {sync.kind === 'syncing' && sync.total > 0 && <Text style={styles.status}>{t('home.progress', { done: sync.done, total: sync.total })}</Text>}
      {sync.kind === 'partial' && <Text style={styles.status}>{t('home.failed', { count: sync.count, detail: sync.detail })}</Text>}
      {sync.kind === 'error' && (
        <View style={styles.errorBox}>
          <Text style={styles.status}>{t('home.error')}</Text>
          <Text style={styles.detail}>{sync.detail}</Text>
        </View>
      )}
      {(email || warranties.length > 0) && (
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

  const empty = email ? (
    <Text style={styles.empty}>{sync.kind === 'syncing' ? t('home.syncing', { email }) : t(tab === 'active' ? 'home.emptyActive' : 'home.emptyExpired')}</Text>
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
            if (email) void runSync(email);
          }} enabled={!!email} colors={[colors.primary]} />
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
  banner: { backgroundColor: colors.banner, borderRadius: 8, padding: 12, minHeight: 48, justifyContent: 'center' },
  bannerText: { fontSize: 16, fontWeight: '600', color: colors.warning.fg },
  status: { fontSize: 14, color: colors.muted },
  errorBox: { gap: 4 },
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
