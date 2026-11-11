import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/nav';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { syncAllAccounts } from '@/accounts';
import { getDb } from '@/db/client';
import { listAccounts, setSyncRange } from '@/db/repo.ts';
import { colors } from '@/theme';

// Section 7: how far back to look, asked after connecting an account (and from "Scan older emails").
const OPTIONS = [
  { key: '2w', days: 14 },
  { key: '1m', days: 30 },
  { key: '3m', days: 91 },
  { key: '6m', days: 182 },
  { key: '12m', days: 365 },
  { key: '18m', days: 548 },
  { key: '24m', days: 730 }, // preselected: the most common legal warranty length
  { key: 'all', days: 0 },
];

export default function SyncRange() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { t } = useTranslation();
  const [days, setDays] = useState(730);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only a connected account: this screen can also be opened by a link, which must not create one.
  const account = async () => (await listAccounts(await getDb())).find((a) => a.email === email);
  useEffect(() => {
    void account().then((a) => (a ? a.first_sync_days !== null && setDays(a.first_sync_days) : goBack()));
  }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    const a = await account();
    if (!a) return goBack();
    setBusy(true);
    setStatus(t('accounts.syncing'));
    try {
      const db = await getDb();
      await setSyncRange(db, a.id, days);
      const problems = await syncAllAccounts(db, (mail, done, total) => setStatus(`${mail}: ${t('home.progress', { done, total })}`));
      if (!problems.length) return goBack();
      setStatus(problems.join('\n')); // stays on screen; Start can be tapped again
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('range.title') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.body}>{t('range.body', { email })}</Text>
        <View style={styles.options} accessibilityRole="radiogroup">
          {OPTIONS.map((o) => (
            <Pressable
              key={o.key}
              style={[styles.option, days === o.days && styles.selected]}
              onPress={() => setDays(o.days)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected: days === o.days }}
            >
              <Text style={[styles.optionText, days === o.days && styles.selectedText]}>
                {t(`range.${o.key}`)}
                {o.days === 730 ? ` ${t('range.recommended')}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.button} onPress={start} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>{t('range.start')}</Text>}
        </Pressable>
        {status && (
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {status}
          </Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16 },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted },
  options: { gap: 8 },
  option: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, justifyContent: 'center' },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: 16, color: colors.text },
  selectedText: { color: colors.onPrimary, fontWeight: '600' },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
  status: { fontSize: 14, color: colors.muted },
});
