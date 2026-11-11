import { useCallback, useState } from 'react';
import { router, Stack, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addGmailAccount, syncAllAccounts } from '@/accounts';
import { disconnectAccount, hasBackupPassword, runBackup } from '@/backup';
import { dumpDb, type BackupInterval } from '@/backup/format.ts';
import { getDb } from '@/db/client';
import { listAccounts, listWarranties, type Account } from '@/db/repo.ts';
import { biometricAvailable, clearLock, isBiometricEnabled, isLockEnabled, setBiometricEnabled, unlockWithBiometrics } from '@/lock/store';
import { rescheduleReminders } from '@/reminders';
import { restartIntoUpdate, versionLine } from '@/appUpdate';
import { deleteAllData, sharePdf, shareText } from '@/dataTools';
import { toCsv, toHtml } from '@/export';
import { chooseBackupAccount } from '@/google';
import { getRemindersEnabled, getReturnRemindersEnabled, getSetting, setRemindersEnabled, setReturnRemindersEnabled, setSetting, setWidgetNames, settingsSnapshot } from '@/settings';
import { updateWidget, widgetShowsNames } from '@/widget';
import { colors } from '@/theme';

const INTERVALS: BackupInterval[] = ['weekly', 'monthly', '3m', '6m'];

// Settings (section 13): mail accounts, app lock, reminders and backup.
export default function Settings() {
  const { t, i18n } = useTranslation();
  const [lock, setLock] = useState(isLockEnabled);
  const [biometric, setBiometric] = useState(isBiometricEnabled);
  const [canBiometric, setCanBiometric] = useState(false);
  const [reminders, setReminders] = useState(getRemindersEnabled);
  const [returnReminders, setReturnReminders] = useState(getReturnRemindersEnabled);
  const [widgetNames, setWidgetNamesState] = useState(widgetShowsNames);
  const [backup, setBackup] = useState(() => getSetting('backup_enabled') === '1' && hasBackupPassword());
  const [interval, setIntervalChoice] = useState<BackupInterval>(() => (getSetting('backup_interval') as BackupInterval) ?? 'weekly');
  const [backupBusy, setBackupBusy] = useState(false);
  const [lastBackup, setLastBackup] = useState(() => getSetting('last_backup_at'));
  const [backupError, setBackupError] = useState(() => getSetting('last_backup_error'));
  const [backupAccount, setBackupAccount] = useState(() => getSetting('backup_account'));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountBusy, setAccountBusy] = useState<string | null>(null); // status line while adding or syncing

  // Back from PIN setup: show whether the lock is now on.
  useFocusEffect(
    useCallback(() => {
      setLock(isLockEnabled());
      setWidgetNamesState(widgetShowsNames()); // the default follows the lock
      void getDb().then(updateWidget).catch((e) => console.warn('widget', e));
      setBiometric(isBiometricEnabled());
      void biometricAvailable().then(setCanBiometric);
      setBackup(getSetting('backup_enabled') === '1' && hasBackupPassword());
      setLastBackup(getSetting('last_backup_at'));
      setBackupError(getSetting('last_backup_error'));
      setBackupAccount(getSetting('backup_account'));
      void getDb().then(listAccounts).then(setAccounts);
    }, []),
  );

  async function toggleLock(on: boolean) {
    if (on) return router.push('/pin');
    await clearLock();
    setLock(false);
    setBiometric(false);
    setWidgetNamesState(widgetShowsNames());
    await updateWidget(await getDb());
  }

  async function toggleBiometric(on: boolean) {
    if (on && !(await unlockWithBiometrics(t('lock.biometricPrompt'), t('lock.usePin')))) return; // prove it works first
    setBiometricEnabled(on);
    setBiometric(on);
  }

  async function toggleWidgetNames(on: boolean) {
    setWidgetNames(on);
    setWidgetNamesState(on);
    await updateWidget(await getDb());
  }

  async function toggleReturnReminders(on: boolean) {
    setReturnRemindersEnabled(on);
    setReturnReminders(on);
    await rescheduleReminders(await getDb());
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
          try {
            await disconnectAccount(db, account);
            Alert.alert(t('accounts.done', { email: account.email }));
          } catch (e) {
            Alert.alert(e instanceof Error ? e.message : String(e));
          }
          setAccounts(await listAccounts(db));
        },
      },
    ]);
  }

  async function backupNow() {
    setBackupBusy(true);
    await runBackup(await getDb(), true).catch(() => {}); // the error is saved and shown below
    setLastBackup(getSetting('last_backup_at'));
    setBackupError(getSetting('last_backup_error'));
    setBackupAccount(getSetting('backup_account'));
    setBackupBusy(false);
  }

  // Export (section 13) and the data rights (GDPR): everything leaves only through the share sheet.
  async function exportList(format: 'csv' | 'pdf') {
    try {
      const list = await listWarranties(await getDb(), 'complete');
      const day = new Date().toISOString().slice(0, 10);
      if (format === 'csv') await shareText(`warrantly-${day}.csv`, '\ufeff' + toCsv(list, t), 'text/csv'); // BOM: Excel reads UTF-8 (á, ő)
      else await sharePdf(`warrantly-${day}.pdf`, toHtml(list, t, t('export.title', { date: day })));
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function exportEverything() {
    try {
      const data = await dumpDb(await getDb(), settingsSnapshot());
      await shareText(`warrantly-all-data-${data.createdAt.slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : String(e));
    }
  }

  function confirmDeleteAll() {
    const run = async (drive: boolean) => {
      try {
        await deleteAllData(await getDb(), drive);
        await restartIntoUpdate().catch(() => router.replace('/onboarding')); // starts fresh, like a new install
      } catch (e) {
        Alert.alert(e instanceof Error ? e.message : String(e));
      }
    };
    Alert.alert(t('data.deleteTitle'), t('data.deleteBody'), [
      { text: t('restore.cancel'), style: 'cancel' },
      { text: t('data.deletePhone'), style: 'destructive', onPress: () => void run(false) },
      { text: t('data.deleteAll'), style: 'destructive', onPress: () => void run(true) },
    ]);
  }

  // Section 17: which Google account's Drive holds the backups. The next backup goes there in full.
  async function changeBackupAccount() {
    try {
      const email = await chooseBackupAccount();
      if (!email) return;
      setBackupAccount(email);
      if (backup) await backupNow();
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : String(e));
    }
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
        {reminders && row(t('settings.returnReminders'), t('settings.returnRemindersHint'), returnReminders, toggleReturnReminders)}
        {Platform.OS === 'android' && row(t('settings.widgetNames'), t('settings.widgetNamesHint'), widgetNames, toggleWidgetNames)}
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
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>{t('backup.account')}</Text>
            <Text style={styles.hint} numberOfLines={1}>
              {backupAccount ?? t('backup.accountNone')}
            </Text>
          </View>
          <Pressable onPress={changeBackupAccount} disabled={backupBusy} accessibilityRole="button" accessibilityLabel={`${t('backup.account')}: ${t('backup.change')}`} hitSlop={8}>
            <Text style={styles.linkSmall}>{t('backup.change')}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.row} onPress={() => router.push('/restore')} accessibilityRole="button">
          <Text style={[styles.label, styles.link]}>{t('backup.restore')}</Text>
        </Pressable>
        <Text style={styles.section} accessibilityRole="header">
          {t('data.section')}
        </Text>
        <Pressable style={styles.row} onPress={() => exportList('pdf')} accessibilityRole="button">
          <Text style={[styles.label, styles.link]}>{t('data.exportPdf')}</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => exportList('csv')} accessibilityRole="button">
          <Text style={[styles.label, styles.link]}>{t('data.exportCsv')}</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={exportEverything} accessibilityRole="button">
          <View style={styles.rowText}>
            <Text style={[styles.label, styles.link]}>{t('data.exportAll')}</Text>
            <Text style={styles.hint}>{t('data.exportAllHint')}</Text>
          </View>
        </Pressable>
        <Pressable style={styles.row} onPress={confirmDeleteAll} accessibilityRole="button">
          <Text style={styles.danger}>{t('data.delete')}</Text>
        </Pressable>
        <Text style={styles.version} selectable>
          {t('settings.version', { version: versionLine(i18n.language) })}
        </Text>
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
  version: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 32 },
  secondary: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
});
