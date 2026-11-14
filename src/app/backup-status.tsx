import { Text, View } from '@/components/themeMotion';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppIcon from '@/components/Icon';
import { Page } from '@/components/Page';
import { Button, Group } from '@/components/ui';
import { runBackup } from '@/backup';
import type { BackupHealth } from '@/backupHealth';
import { readBackupHealth } from '@/backupStatus';
import { getDb } from '@/db/client';
import { colors, TYPE, themed } from '@/theme';

// Backup health (shortlist 20): whether the latest data and documents are on Drive, in plain words, with
// the one thing to do about it.
export default function BackupStatus() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => void readBackupHealth().then(setHealth), []);
  useFocusEffect(reload);
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language);

  async function retry() {
    setBusy(true);
    await runBackup(await getDb(), true).catch(() => {}); // the error is stored and shown here
    setBusy(false);
    reload();
  }

  if (!health) return <Page title={t('health.title')}><View /></Page>;
  const good = health.state === 'ok';
  const bad = health.state === 'failed' || health.state === 'overdue' || health.state === 'never';
  const headline = t(`health.${health.state}`);
  const detail =
    health.state === 'failed' ? t('health.failedDetail', { detail: health.error, date: health.at ? when(health.at) : '' })
      : health.state === 'pending' ? [health.changes ? t('health.pendingChanges') : null, health.documents ? t('health.pendingDocs', { count: health.documents }) : null, t('backup.last', { date: when(health.lastAt) })].filter(Boolean).join('\n')
        : health.state === 'ok' || health.state === 'overdue' ? t('backup.last', { date: when(health.lastAt) })
          : health.state === 'off' ? t('health.offDetail') : t('health.neverDetail');

  return (
    <Page title={t('health.title')}>
      <Group style={styles.card}>
        <View style={styles.head} accessible accessibilityLiveRegion="polite">
          <AppIcon name={good ? 'checkmark-circle' : bad ? 'alert-circle' : health.state === 'off' ? 'cloud-offline-outline' : 'time-outline'} size={36} color={good ? colors.ok : bad ? colors.bad : colors.warn} />
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
        {health.state === 'off'
          ? <Button title={t('health.turnOn')} onPress={() => router.push('/settings')} />
          : <Button title={health.state === 'failed' ? t('home.retry') : t('backup.now')} onPress={() => void retry()} busy={busy} />}
      </Group>
    </Page>
  );
}

const useStyles = themed(() => StyleSheet.create({
  card: { padding: 20, gap: 16, marginTop: 12 },
  head: { alignItems: 'center', gap: 8 },
  headline: { ...TYPE.title3, color: colors.ink, textAlign: 'center' },
  detail: { ...TYPE.sub, color: colors.ink2, textAlign: 'center' },
}));
