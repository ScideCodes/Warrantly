import { Text } from '@/components/themeMotion';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/nav';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { syncAllAccounts } from '@/accounts';
import { getDb } from '@/db/client';
import { listAccounts, setSyncRange } from '@/db/repo.ts';
import { Page } from '@/components/Page';
import { Button, Group, Row } from '@/components/ui';
import { colors, TYPE, themed } from '@/theme';

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
  const styles = useStyles();
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
    <Page
      title={t('range.title')}
      lead={t('range.body', { email })}
      footer={
        <>
          {status && (
            <Text style={styles.status} accessibilityLiveRegion="polite">
              {status}
            </Text>
          )}
          <Button title={t('range.start')} onPress={start} busy={busy} />
        </>
      }
    >
      {/* Selected like the reference's pressed cell: --tint-soft with a tint-ink semibold label. */}
      <Group style={styles.group} accessibilityRole="radiogroup">
        {OPTIONS.map((o, i) => (
          <Row
            key={o.key}
            separator={i > 0}
            selected={days === o.days}
            onPress={() => setDays(o.days)}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityState={{ checked: days === o.days }}
          >
            <Text style={[styles.option, days === o.days && styles.selected]}>
              {t(`range.${o.key}`)}
              {o.days === 730 ? ` ${t('range.recommended')}` : ''}
            </Text>
          </Row>
        ))}
      </Group>
    </Page>
  );
}

const useStyles = themed(() => StyleSheet.create({
  group: { marginTop: 16 },
  option: { ...TYPE.body, flex: 1, color: colors.ink },
  selected: { color: colors.tintInk, fontWeight: '600' },
  status: { ...TYPE.foot, color: colors.ink2, marginBottom: 8, paddingHorizontal: 4 },
}));
