import { useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { syncAllAccounts } from '@/accounts';
import { getDb } from '@/db/client';
import { setSyncRange, upsertAccount } from '@/db/repo.ts';
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

  useEffect(() => {
    void getDb()
      .then((db) => upsertAccount(db, email))
      .then((a) => a.first_sync_days !== null && setDays(a.first_sync_days));
  }, [email]);

  async function start() {
    const db = await getDb();
    await setSyncRange(db, (await upsertAccount(db, email)).id, days);
    setStatus(t('accounts.syncing'));
    const problems = await syncAllAccounts(db, (mail, done, total) => setStatus(`${mail}: ${t('home.progress', { done, total })}`));
    if (problems.length) return setStatus(problems.join('\n'));
    router.back();
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
              disabled={status !== null}
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
        <Pressable style={styles.button} onPress={start} disabled={status !== null} accessibilityRole="button">
          {status ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>{t('range.start')}</Text>}
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
