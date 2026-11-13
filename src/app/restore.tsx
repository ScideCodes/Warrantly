import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { latestBackup, PasswordNeededError, restoreBackup } from '@/backup';
import { WrongPasswordError } from '@/backup/format.ts';
import { getDb } from '@/db/client';
import { Page } from '@/components/Page';
import { showAlert } from '@/components/Dialog';
import { Button, Group, Input } from '@/components/ui';
import { colors, TYPE } from '@/theme';

// Restore the newest backup from Google Drive (section 17). Replaces everything on this phone.
export default function Restore() {
  const { t, i18n } = useTranslation();
  const [backup, setBackup] = useState<{ id: string; createdTime: string } | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    latestBackup()
      .then(setBackup)
      .catch((e) => {
        setBackup(null);
        setMessage(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const date = backup ? new Date(backup.createdTime).toLocaleString(i18n.language) : '';

  function confirm() {
    showAlert(t('restore.confirmTitle'), t('restore.confirmBody', { date }), [
      { text: t('restore.cancel'), style: 'cancel' },
      { text: t('restore.confirm'), style: 'destructive', onPress: restore },
    ]);
  }

  async function restore() {
    setBusy(true);
    setMessage(null);
    try {
      await restoreBackup(await getDb(), backup!.id, password || null);
      showAlert(t('restore.done'));
      router.replace('/');
    } catch (e) {
      setMessage(e instanceof PasswordNeededError ? t('restore.needPassword') : e instanceof WrongPasswordError ? t('restore.wrong') : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={t('restore.title')} contentContainerStyle={styles.content}>
        {backup === undefined && (
          <View style={styles.row}>
            <ActivityIndicator color={colors.tint} />
            <Text style={styles.body}>{t('restore.looking')}</Text>
          </View>
        )}
        {backup === null && !message && <Text style={styles.body}>{t('restore.none')}</Text>}
        {backup && (
          <>
            <Text style={styles.title}>{t('restore.found', { date })}</Text>
            <Group style={styles.panel}>
              <Text style={styles.label} nativeID="restore-pw">
                {t('restore.password')}
              </Text>
              <Input value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" accessibilityLabelledBy="restore-pw" />
              <Text style={styles.hint}>{t('restore.passwordHint')}</Text>
            </Group>
            <Button title={t('restore.button')} onPress={confirm} busy={busy} />
          </>
        )}
        {message && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {message}
          </Text>
        )}
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 4 },
  title: { ...TYPE.headline, color: colors.ink, paddingHorizontal: 4 },
  body: { ...TYPE.body, color: colors.ink2, paddingHorizontal: 4 },
  panel: { paddingVertical: 12, paddingHorizontal: 16, gap: 10 },
  label: { ...TYPE.foot, color: colors.ink2 },
  hint: { ...TYPE.foot, color: colors.ink2 },
  error: { ...TYPE.foot, color: colors.bad, paddingHorizontal: 4 },
});
