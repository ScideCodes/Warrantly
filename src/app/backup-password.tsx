import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/nav';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { runBackup, setBackupPassword } from '@/backup';
import { getDb } from '@/db/client';
import { setSetting } from '@/settings';
import { Page } from '@/components/Page';
import { Button, Group, Input } from '@/components/ui';
import { colors, TYPE } from '@/theme';

const MIN_PASSWORD = 8;

// Choose the password backups are encrypted with (section 17). With purpose=disconnect it only sets the
// password (needed before disconnecting an account, section 15) and leaves automatic backup as it is.
export default function BackupPassword() {
  const { t } = useTranslation();
  const { purpose } = useLocalSearchParams<{ purpose?: string }>();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (password.length < MIN_PASSWORD) return setError(t('backupPassword.errShort'));
    if (password !== repeat) return setError(t('backupPassword.errMatch'));
    setBusy(true);
    await setBackupPassword(password); // a few seconds: the key is derived with scrypt
    if (purpose !== 'disconnect') {
      setSetting('backup_enabled', '1');
      await runBackup(await getDb(), true).catch(() => {}); // a failure shows in Settings; backup stays on
    }
    goBack();
  }

  // Form fields as in the reference's panels: a Footnote label above a filled field.
  const input = (label: string, value: string, onChange: (v: string) => void, id: string) => (
    <View style={styles.field}>
      <Text style={styles.label} nativeID={id}>
        {label}
      </Text>
      <Input value={value} onChangeText={onChange} secureTextEntry autoCapitalize="none" autoComplete="new-password" accessibilityLabelledBy={id} />
    </View>
  );

  return (
    <Page
      title={t('backupPassword.title')}
      footer={
        <>
          {busy && <Text style={styles.hint}>{t('backupPassword.working')}</Text>}
          <Button title={t(purpose === 'disconnect' ? 'backupPassword.saveOnly' : 'backupPassword.save')} onPress={save} busy={busy} />
        </>
      }
    >
      <View style={styles.warning}>
        <Text style={styles.warningText}>{t('backupPassword.body')}</Text>
      </View>
      <Group style={styles.panel}>
        {input(t('backupPassword.password'), password, setPassword, 'pw')}
        {input(t('backupPassword.confirm'), repeat, setRepeat, 'pw2')}
        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}
      </Group>
    </Page>
  );
}

const styles = StyleSheet.create({
  warning: { marginTop: 8, padding: 16, borderRadius: 26, backgroundColor: colors.warnSoft },
  warningText: { ...TYPE.sub, color: colors.warn },
  panel: { marginTop: 22, paddingVertical: 12, paddingHorizontal: 16 },
  field: { gap: 10, paddingVertical: 4 },
  label: { ...TYPE.foot, color: colors.ink2, marginTop: 6 },
  error: { ...TYPE.foot, color: colors.bad, marginTop: 8 },
  hint: { ...TYPE.foot, color: colors.ink2, textAlign: 'center', marginBottom: 8 },
});
