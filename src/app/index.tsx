import { useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { connectedEmail, connectGmail, getAccessToken } from '@/google';
import { gmailProvider } from '@/mail/gmail.ts';
import { fetchAndParse } from '@/mail/provider.ts';
import type { ParseResult } from '@/parser/types.ts';
import { getUsername } from '@/settings';
import { colors } from '@/theme';

type SyncState =
  | { kind: 'idle' }
  | { kind: 'syncing'; email: string }
  | { kind: 'done'; results: ParseResult[] }
  | { kind: 'error'; detail: string };

const FIRST_SYNC_MONTHS = 24; // section 7 default; the range picker comes with onboarding polish

// Home. Shows the first Gmail sync result until the warranty list replaces it in build step 3.
export default function Home() {
  const { t } = useTranslation();
  const name = getUsername();
  const [sync, setSync] = useState<SyncState>({ kind: 'idle' });
  if (!name) return <Redirect href="/onboarding" />;

  async function runSync() {
    try {
      const email = connectedEmail() ?? (await connectGmail());
      if (!email) return; // user cancelled the Google dialog
      setSync({ kind: 'syncing', email });
      const after = new Date();
      after.setMonth(after.getMonth() - FIRST_SYNC_MONTHS);
      const results = await fetchAndParse(gmailProvider(getAccessToken), after);
      setSync({ kind: 'done', results: results.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)) });
    } catch (e) {
      setSync({ kind: 'error', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  const header = (
    <View style={styles.header}>
      <Text style={styles.greeting} accessibilityRole="header">
        {t('home.greeting', { name })}
      </Text>
      {sync.kind === 'done' && (
        <Text style={styles.summary}>
          {t('home.summary', {
            complete: sync.results.filter((r) => r.status === 'complete').length,
            needsInput: sync.results.filter((r) => r.status === 'needs_input').length,
            ignored: sync.results.filter((r) => r.kind === 'ignored').length,
          })}
        </Text>
      )}
    </View>
  );

  if (sync.kind === 'done') {
    return (
      <SafeAreaView style={styles.screen}>
        <FlatList data={sync.results.filter((r) => r.kind !== 'ignored')} keyExtractor={(r) => r.messageId} ListHeaderComponent={header} renderItem={({ item }) => <ResultRow result={item} />} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {header}
      <View style={styles.center}>
        {sync.kind === 'syncing' ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.body}>{t('home.syncing', { email: sync.email })}</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>{sync.kind === 'error' ? t('home.error') : t('home.emptyTitle')}</Text>
            {sync.kind === 'error' ? <Text style={styles.detail}>{sync.detail}</Text> : <Text style={styles.body}>{t('home.emptyBody')}</Text>}
            <Pressable style={styles.button} onPress={runSync} accessibilityRole="button">
              <Text style={styles.buttonText}>{sync.kind === 'error' ? t('home.retry') : t('home.connectGmail')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function ResultRow({ result }: { result: ParseResult }) {
  const { t } = useTranslation();
  const status = result.kind === 'return' ? t('home.statusReturn') : result.status === 'complete' ? t('home.statusComplete') : t('home.statusNeedsInput');
  const products = result.items.length ? result.items.map((i) => i.name).join(', ') : t('home.unknownProduct');
  const months = result.items.find((i) => i.warrantyMonths)?.warrantyMonths;
  const length = months
    ? t('home.months', { count: months })
    : result.suggestedWarrantyMonths
      ? t('home.suggested', { months: t('home.months', { count: result.suggestedWarrantyMonths }) })
      : null;

  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{products}</Text>
      <Text style={styles.rowMeta}>
        {result.storeName} · {result.purchaseDate}
        {length ? ` · ${length}` : ''}
      </Text>
      <Text style={[styles.rowStatus, result.status === 'complete' && styles.rowStatusDone]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
  header: { paddingTop: 24, paddingBottom: 16, gap: 8 },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.text },
  summary: { fontSize: 16, color: colors.muted },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  detail: { fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, marginTop: 8 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 14, color: colors.muted },
  rowStatus: { fontSize: 14, fontWeight: '600', color: colors.muted },
  rowStatusDone: { color: colors.primary },
});
