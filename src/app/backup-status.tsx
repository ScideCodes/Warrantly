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
import { BackupStatusSkeleton } from '@/components/Skeleton';

// Backup health (shortlist 20): whether the latest data and documents are on Drive, in plain words, with
// the one thing to do about it.
export default function BackupStatus() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState(false);
  const reload = useCallback(() => {
    setReadError(false);
    void readBackupHealth().then(setHealth).catch(() => setReadError(true));
  }, []);
  useFocusEffect(reload);
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language);

  async function retry() {
    setBusy(true);
    try {
      await runBackup(await getDb(), true);
    } catch {
      // Read the stored backup failure, including failures before the upload starts.
    } finally {
      setBusy(false);
      reload();
    }
  }

  if (!health) return <Page title={t('health.title')}>
    {readError ? (
      <View style={styles.card}>
        <Text style={styles.detail}>{t('health.readFailed')}</Text>
        <Button kind="glass" title={t('home.retry')} onPress={reload} />
      </View>
    ) : (
      <BackupStatusSkeleton />
    )}
  </Page>;
  const good = health.state === 'ok';
  const bad = health.state === 'failed' || health.state === 'overdue';
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
          <AppIcon name={good ? 'checkmark-circle' : bad ? 'alert-circle' : health.state === 'off' ? 'cloud-offline-outline' : 'time-outline'} size={28} color={good ? colors.ok : health.state === 'failed' ? colors.bad : health.state === 'overdue' ? colors.warn : colors.ink2} />
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
  loading: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  head: { alignItems: 'flex-start', gap: 8 },
  headline: { ...TYPE.title3, color: colors.ink },
  detail: { ...TYPE.sub, color: colors.ink2 },
}));
