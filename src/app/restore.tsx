import { useEffect, useState } from 'react';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { latestBackup, PasswordNeededError, restoreBackup } from '@/backup';
import { WrongPasswordError } from '@/backup/format.ts';
import { getDb } from '@/db/client';
import { colors } from '@/theme';

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
    Alert.alert(t('restore.confirmTitle'), t('restore.confirmBody', { date }), [
      { text: t('restore.cancel'), style: 'cancel' },
      { text: t('restore.confirm'), style: 'destructive', onPress: restore },
    ]);
  }

  async function restore() {
    setBusy(true);
    setMessage(null);
    try {
      await restoreBackup(await getDb(), backup!.id, password || null);
      Alert.alert(t('restore.done'));
      router.replace('/');
    } catch (e) {
      setMessage(e instanceof PasswordNeededError ? t('restore.needPassword') : e instanceof WrongPasswordError ? t('restore.wrong') : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('restore.title') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {backup === undefined && (
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.body}>{t('restore.looking')}</Text>
          </View>
        )}
        {backup === null && !message && <Text style={styles.body}>{t('restore.none')}</Text>}
        {backup && (
          <>
            <Text style={styles.title}>{t('restore.found', { date })}</Text>
            <View style={styles.field}>
              <Text style={styles.label} nativeID="restore-pw">
                {t('restore.password')}
              </Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" accessibilityLabelledBy="restore-pw" />
              <Text style={styles.hint}>{t('restore.passwordHint')}</Text>
            </View>
            <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={confirm} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>{t('restore.button')}</Text>}
            </Pressable>
          </>
        )}
        {message && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {message}
          </Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, color: colors.muted },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, fontSize: 16, color: colors.text },
  hint: { fontSize: 13, color: colors.muted },
  error: { fontSize: 14, color: colors.soon.fg },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { backgroundColor: colors.primaryDisabled },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
});
