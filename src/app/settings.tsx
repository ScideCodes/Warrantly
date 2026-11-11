import { useCallback, useState } from 'react';
import { router, Stack, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getDb } from '@/db/client';
import { biometricAvailable, clearLock, isBiometricEnabled, isLockEnabled, setBiometricEnabled, unlockWithBiometrics } from '@/lock/store';
import { rescheduleReminders } from '@/reminders';
import { getRemindersEnabled, setRemindersEnabled } from '@/settings';
import { colors } from '@/theme';

// Settings (section 13): app lock and reminders for now.
export default function Settings() {
  const { t } = useTranslation();
  const [lock, setLock] = useState(isLockEnabled);
  const [biometric, setBiometric] = useState(isBiometricEnabled);
  const [canBiometric, setCanBiometric] = useState(false);
  const [reminders, setReminders] = useState(getRemindersEnabled);

  // Back from PIN setup: show whether the lock is now on.
  useFocusEffect(
    useCallback(() => {
      setLock(isLockEnabled());
      setBiometric(isBiometricEnabled());
      void biometricAvailable().then(setCanBiometric);
    }, []),
  );

  async function toggleLock(on: boolean) {
    if (on) return router.push('/pin');
    await clearLock();
    setLock(false);
    setBiometric(false);
  }

  async function toggleBiometric(on: boolean) {
    if (on && !(await unlockWithBiometrics(t('lock.biometricPrompt'), t('lock.usePin')))) return; // prove it works first
    setBiometricEnabled(on);
    setBiometric(on);
  }

  async function toggleReminders(on: boolean) {
    setRemindersEnabled(on);
    setReminders(on);
    await rescheduleReminders(await getDb());
  }

  const row = (label: string, hint: string | null, value: boolean, onChange: (v: boolean) => void) => (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('settings.title') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {row(t('settings.lock'), t('settings.lockHint'), lock, toggleLock)}
        {lock && (
          <Pressable style={styles.row} onPress={() => router.push('/pin')} accessibilityRole="button">
            <Text style={[styles.label, styles.link]}>{t('settings.changePin')}</Text>
          </Pressable>
        )}
        {lock && canBiometric && row(t('settings.biometric'), null, biometric, toggleBiometric)}
        {row(t('settings.reminders'), t('settings.remindersHint'), reminders, toggleReminders)}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { flex: 1, gap: 4 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  hint: { fontSize: 14, color: colors.muted },
  link: { color: colors.primary },
});
