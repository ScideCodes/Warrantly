import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { runBackup, setBackupPassword } from '@/backup';
import { getDb } from '@/db/client';
import { setSetting } from '@/settings';
import { colors } from '@/theme';

const MIN_PASSWORD = 8;

// Turn on backup: choose the password the backup is encrypted with (section 17).
export default function BackupPassword() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (password.length < MIN_PASSWORD) return setError(t('backupPassword.errShort'));
    if (password !== repeat) return setError(t('backupPassword.errMatch'));
    setBusy(true);
    await setBackupPassword(password); // a few seconds: the key is derived with scrypt
    setSetting('backup_enabled', '1');
    await runBackup(await getDb(), true).catch(() => {}); // a failure shows in Settings; backup stays on
    router.back();
  }

  const input = (label: string, value: string, onChange: (v: string) => void, id: string) => (
    <View style={styles.field}>
      <Text style={styles.label} nativeID={id}>
        {label}
      </Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange} secureTextEntry autoCapitalize="none" autoComplete="new-password" accessibilityLabelledBy={id} />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('backupPassword.title') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.warning}>{t('backupPassword.body')}</Text>
        {input(t('backupPassword.password'), password, setPassword, 'pw')}
        {input(t('backupPassword.confirm'), repeat, setRepeat, 'pw2')}
        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}
        <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={save} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>{t('backupPassword.save')}</Text>}
        </Pressable>
        {busy && <Text style={styles.hint}>{t('backupPassword.working')}</Text>}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16 },
  warning: { fontSize: 15, lineHeight: 22, color: colors.warning.fg, backgroundColor: colors.warning.bg, padding: 12, borderRadius: 8 },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, fontSize: 16, color: colors.text },
  error: { fontSize: 14, color: colors.soon.fg },
  hint: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { backgroundColor: colors.primaryDisabled },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
});
