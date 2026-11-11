import { useCallback, useState } from 'react';
import { router, Stack, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addGmailAccount, syncAllAccounts } from '@/accounts';
import { disconnectAccount, hasBackupPassword, runBackup } from '@/backup';
import type { BackupInterval } from '@/backup/format.ts';
import { getDb } from '@/db/client';
import { listAccounts, type Account } from '@/db/repo.ts';
import { biometricAvailable, clearLock, isBiometricEnabled, isLockEnabled, setBiometricEnabled, unlockWithBiometrics } from '@/lock/store';
import { rescheduleReminders } from '@/reminders';
import { getRemindersEnabled, getSetting, setRemindersEnabled, setSetting } from '@/settings';
import { colors } from '@/theme';

const INTERVALS: BackupInterval[] = ['weekly', 'monthly', '3m', '6m'];

// Settings (section 13): mail accounts, app lock, reminders and backup.
export default function Settings() {
  const { t, i18n } = useTranslation();
  const [lock, setLock] = useState(isLockEnabled);
  const [biometric, setBiometric] = useState(isBiometricEnabled);
  const [canBiometric, setCanBiometric] = useState(false);
  const [reminders, setReminders] = useState(getRemindersEnabled);
  const [backup, setBackup] = useState(() => getSetting('backup_enabled') === '1' && hasBackupPassword());
  const [interval, setIntervalChoice] = useState<BackupInterval>(() => (getSetting('backup_interval') as BackupInterval) ?? 'weekly');
  const [backupBusy, setBackupBusy] = useState(false);
  const [lastBackup, setLastBackup] = useState(() => getSetting('last_backup_at'));
  const [backupError, setBackupError] = useState(() => getSetting('last_backup_error'));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountBusy, setAccountBusy] = useState<string | null>(null); // status line while adding or syncing

  // Back from PIN setup: show whether the lock is now on.
  useFocusEffect(
    useCallback(() => {
      setLock(isLockEnabled());
      setBiometric(isBiometricEnabled());
      void biometricAvailable().then(setCanBiometric);
      setBackup(getSetting('backup_enabled') === '1' && hasBackupPassword());
      setLastBackup(getSetting('last_backup_at'));
      setBackupError(getSetting('last_backup_error'));
      void getDb().then(listAccounts).then(setAccounts);
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

  async function addAccount() {
    const db = await getDb();
    try {
      const added = await addGmailAccount(db);
      if (!added) return;
      setAccounts(await listAccounts(db));
      if (added.needsRange) return router.push({ pathname: '/sync-range', params: { email: added.email } }); // syncs when started
      setAccountBusy(t('accounts.syncing'));
      const problems = await syncAllAccounts(db, () => {});
      setAccountBusy(problems.length ? problems.join('\n') : null);
    } catch (e) {
      setAccountBusy(e instanceof Error ? e.message : String(e));
    }
  }

  // Section 15: an encrypted backup of the account is made first; it needs the backup password.
  function disconnect(account: Account) {
    if (!hasBackupPassword()) {
      return Alert.alert(t('accounts.needPassword'), undefined, [
        { text: t('restore.cancel'), style: 'cancel' },
        { text: t('accounts.setPassword'), onPress: () => router.push({ pathname: '/backup-password', params: { purpose: 'disconnect' } }) },
      ]);
    }
    Alert.alert(t('accounts.confirmTitle', { email: account.email }), t('accounts.confirmBody'), [
      { text: t('restore.cancel'), style: 'cancel' },
      {
        text: t('accounts.disconnect'),
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          await disconnectAccount(db, account);
          setAccounts(await listAccounts(db));
          Alert.alert(t('accounts.done', { email: account.email }));
        },
      },
    ]);
  }

  async function backupNow() {
    setBackupBusy(true);
    await runBackup(await getDb(), true).catch(() => {}); // the error is saved and shown below
    setLastBackup(getSetting('last_backup_at'));
    setBackupError(getSetting('last_backup_error'));
    setBackupBusy(false);
  }

  async function toggleBackup(on: boolean) {
    if (!on) {
      setSetting('backup_enabled', '0');
      return setBackup(false);
    }
    if (!hasBackupPassword()) return router.push('/backup-password'); // turns backup on when saved
    setSetting('backup_enabled', '1');
    setBackup(true);
    await backupNow();
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
        <Text style={[styles.section, styles.firstSection]} accessibilityRole="header">
          {t('accounts.section')}
        </Text>
        {accounts.map((a) => (
          <View key={a.id} style={styles.row}>
            <Text style={[styles.label, styles.rowText]} numberOfLines={1}>
              {a.email}
            </Text>
            <Pressable
              onPress={() => router.push({ pathname: '/sync-range', params: { email: a.email } })}
              accessibilityRole="button"
              accessibilityLabel={`${t('accounts.scanOlder')}: ${a.email}`}
              hitSlop={8}
            >
              <Text style={styles.linkSmall}>{t('accounts.scanOlder')}</Text>
            </Pressable>
            <Pressable onPress={() => disconnect(a)} accessibilityRole="button" accessibilityLabel={`${t('accounts.disconnect')}: ${a.email}`} hitSlop={8}>
              <Text style={styles.danger}>{t('accounts.disconnect')}</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.row} onPress={addAccount} accessibilityRole="button">
          <Text style={[styles.label, styles.link]}>+ {t('accounts.add')}</Text>
        </Pressable>
        {accountBusy && <Text style={styles.hint}>{accountBusy}</Text>}

        <Text style={styles.section} accessibilityRole="header">
          {t('settings.general')}
        </Text>
        {row(t('settings.lock'), t('settings.lockHint'), lock, toggleLock)}
        {lock && (
          <Pressable style={styles.row} onPress={() => router.push('/pin')} accessibilityRole="button">
            <Text style={[styles.label, styles.link]}>{t('settings.changePin')}</Text>
          </Pressable>
        )}
        {lock && canBiometric && row(t('settings.biometric'), null, biometric, toggleBiometric)}
        {row(t('settings.reminders'), t('settings.remindersHint'), reminders, toggleReminders)}
        <Pressable style={styles.row} onPress={() => router.push('/ignored')} accessibilityRole="button">
          <Text style={[styles.label, styles.link]}>{t('ignored.title')}</Text>
        </Pressable>

        <Text style={styles.section} accessibilityRole="header">
          {t('backup.section')}
        </Text>
        {row(t('backup.enable'), t('backup.enableHint'), backup, toggleBackup)}
        {backup && (
          <View style={styles.block}>
            <Text style={styles.label}>{t('backup.interval')}</Text>
            <View style={styles.chips}>
              {INTERVALS.map((i) => (
                <Pressable
                  key={i}
                  style={[styles.chip, interval === i && styles.chipSelected]}
                  onPress={() => {
                    setSetting('backup_interval', i);
                    setIntervalChoice(i);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: interval === i }}
                >
                  <Text style={[styles.chipText, interval === i && styles.chipTextSelected]}>{t(`backup.${i}`)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={backupError ? styles.error : styles.hint}>
              {backupBusy
                ? t('backup.working')
                : backupError
                  ? t('backup.failed', { detail: backupError })
                  : lastBackup
                    ? t('backup.last', { date: new Date(lastBackup).toLocaleString(i18n.language) })
                    : t('backup.never')}
            </Text>
            <Pressable style={styles.secondary} onPress={backupNow} disabled={backupBusy} accessibilityRole="button">
              {backupBusy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryText}>{t('backup.now')}</Text>}
            </Pressable>
          </View>
        )}
        <Pressable style={styles.row} onPress={() => router.push('/restore')} accessibilityRole="button">
          <Text style={[styles.label, styles.link]}>{t('backup.restore')}</Text>
        </Pressable>
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
  firstSection: { marginTop: 0 },
  linkSmall: { fontSize: 15, fontWeight: '600', color: colors.primary },
  danger: { fontSize: 15, fontWeight: '600', color: colors.soon.fg },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginTop: 32, marginBottom: 4 },
  block: { gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, color: colors.text },
  chipTextSelected: { color: colors.onPrimary, fontWeight: '600' },
  error: { fontSize: 14, color: colors.soon.fg },
  secondary: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
});
