import { useCallback, useState, type ReactNode } from 'react';
import { router, Stack, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { addGmailAccount, syncAllAccounts } from '@/accounts';
import { disconnectAccount, hasBackupPassword, runBackup } from '@/backup';
import { dumpDb, type BackupInterval } from '@/backup/format.ts';
import { getDb } from '@/db/client';
import { listAccounts, listWarranties, type Account } from '@/db/repo.ts';
import { biometricAvailable, clearLock, isBiometricEnabled, isLockEnabled, setBiometricEnabled, unlockWithBiometrics } from '@/lock/store';
import { rescheduleReminders } from '@/reminders';
import { restartIntoUpdate, versionLine } from '@/appUpdate';
import { openStorePage } from '@/rate';
import { deleteAllData, importSharedFile, sharePdf, shareText, shareWarranties } from '@/dataTools';
import { toCsv, toHtml } from '@/export';
import { chooseBackupAccount } from '@/google';
import { appLanguage, resources } from '@/i18n';
import { getLanguageSetting, getThemeSetting, setLanguageSetting, setThemeSetting, getReminderGroups, getReminderTime, getRemindersEnabled, getReturnRemindersEnabled, getSetting, setReminderGroups, setReminderTime, setRemindersEnabled, setReturnRemindersEnabled, setSetting, setWidgetNames, settingsSnapshot } from '@/settings';
import { updateWidget, widgetShowsNames } from '@/widget';
import { colors } from '@/theme';
import { ALL_GROUPS, type ReminderGroup } from '@/warranty';


const INTERVALS: BackupInterval[] = ['weekly', 'monthly', '3m', '6m'];

// Settings (section 13): mail accounts, app lock, reminders and backup.
export default function Settings() {
  const { t, i18n } = useTranslation();
  const [lock, setLock] = useState(isLockEnabled);
  const [biometric, setBiometric] = useState(isBiometricEnabled);
  const [canBiometric, setCanBiometric] = useState(false);
  const [reminders, setReminders] = useState(getRemindersEnabled);
  const [returnReminders, setReturnReminders] = useState(getReturnRemindersEnabled);
  const [time, setTime] = useState(getReminderTime);
  const [language, setLanguage] = useState(getLanguageSetting);
  const [theme, setTheme] = useState(getThemeSetting);
  const [groups, setGroups] = useState(getReminderGroups);
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
    if (on && !(await unlockWithBiometrics(t('lock.biometricPrompt'), t('lock.usePin'))).success) return; // prove it works first
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

  async function chooseLanguage(code: string) {
    setLanguageSetting(code);
    setLanguage(code);
    await i18n.changeLanguage(appLanguage());
    await rescheduleReminders(await getDb()); // reminder texts are written in the app language
  }

  // Styles are built at start, so a new theme needs a restart.
  function chooseTheme(next: string) {
    setThemeSetting(next);
    setTheme(next);
    restartIntoUpdate().catch(() => Alert.alert(t('settings.themeRestart')));
  }

  // Reminder time: Android's own clock picker; elsewhere (web preview) 9:00 and 18:00 alternate.
  function pickTime() {
    const save = async (minutes: number) => {
      setReminderTime(minutes);
      setTime(minutes);
      await rescheduleReminders(await getDb());
    };
    if (Platform.OS !== 'android') return void save(time === 540 ? 1080 : 540);
    DateTimePickerAndroid.open({
      value: new Date(2026, 0, 1, Math.floor(time / 60), time % 60),
      mode: 'time',
      onValueChange: (_e, d) => void save(d.getHours() * 60 + d.getMinutes()),
    });
  }
  const timeLabel = new Date(2026, 0, 1, Math.floor(time / 60), time % 60).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' });

  async function toggleGroup(g: ReminderGroup) {
    const next = groups.includes(g) ? groups.filter((x) => x !== g) : ALL_GROUPS.filter((x) => x === g || groups.includes(x));
    setReminderGroups(next);
    setGroups(next);
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

  async function shareAll() {
    try {
      const db = await getDb();
      const ids = (await listWarranties(db, 'complete')).map((w) => w.id);
      await shareWarranties(db, ids, `warrantly-shared-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function importShared() {
    try {
      const db = await getDb();
      const added = await importSharedFile(db);
      if (added !== null) Alert.alert(t('data.imported', { count: added }));
      await rescheduleReminders(db);
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
  const link = (label: string, onPress: () => void, opts: { hint?: string; danger?: boolean; value?: string } = {}) => (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <View style={styles.rowText}>
        <Text style={[styles.label, opts.danger && styles.dangerLabel]}>{label}</Text>
        {opts.hint && <Text style={styles.hint}>{opts.hint}</Text>}
      </View>
      {opts.value && <Text style={styles.value}>{opts.value}</Text>}
      {!opts.danger && <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
  const choices = (label: string, items: { key: string; text: string }[], selected: string, onPick: (key: string) => void) => (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {items.map((it) => (
          <Pressable
            key={it.key}
            style={[styles.chip, selected === it.key && styles.chipSelected]}
            onPress={() => onPick(it.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === it.key }}
          >
            <Text style={[styles.chipText, selected === it.key && styles.chipTextSelected]}>{it.text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  // One card per topic, with a heading above it, so sections are easy to tell apart.
  const section = (title: string, body: ReactNode) => (
    <View style={styles.sectionWrap}>
      <Text style={styles.section} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.card}>{body}</View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('settings.title') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {section(
          t('accounts.section'),
          <>
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
            {accountBusy && <Text style={[styles.hint, styles.pad]}>{accountBusy}</Text>}
            {link(t('ignored.title'), () => router.push('/ignored'))}
          </>,
        )}

        {section(
          t('settings.remindersSection'),
          <>
            {row(t('settings.reminders'), t('settings.remindersHint'), reminders, toggleReminders)}
            {reminders && (
              <>
                {ALL_GROUPS.map((g) => (
                  <Pressable
                    key={g}
                    style={styles.row}
                    onPress={() => toggleGroup(g)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: groups.includes(g) }}
                  >
                    <Text style={[styles.label, styles.rowText]}>{t(`settings.group_${g}`)}</Text>
                    <View style={[styles.check, groups.includes(g) && styles.checkOn]}>{groups.includes(g) && <Text style={styles.checkMark}>✓</Text>}</View>
                  </Pressable>
                ))}
                {link(t('settings.reminderTime'), pickTime, { value: timeLabel })}
                {row(t('settings.returnReminders'), t('settings.returnRemindersHint'), returnReminders, toggleReturnReminders)}
              </>
            )}
          </>,
        )}

        {section(
          t('settings.security'),
          <>
            {row(t('settings.lock'), t('settings.lockHint'), lock, toggleLock)}
            {lock && link(t('settings.changePin'), () => router.push('/pin'))}
            {lock && canBiometric && row(t('settings.biometric'), null, biometric, toggleBiometric)}
            {Platform.OS === 'android' && row(t('settings.widgetNames'), t('settings.widgetNamesHint'), widgetNames, toggleWidgetNames)}
          </>,
        )}

        {section(
          t('settings.general'),
          <>
            {choices(t('settings.language'), ['system', ...Object.keys(resources)].map((key) => ({ key, text: t(`settings.lang_${key}`) })), language, chooseLanguage)}
            {choices(t('settings.theme'), ['system', 'light', 'dark'].map((key) => ({ key, text: t(`settings.theme_${key}`) })), theme, chooseTheme)}
          </>,
        )}

        {section(
          t('backup.section'),
          <>
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
            {link(t('backup.restore'), () => router.push('/restore'))}
          </>,
        )}

        {section(
          t('data.section'),
          <>
            {link(t('data.exportPdf'), () => exportList('pdf'))}
            {link(t('data.exportCsv'), () => exportList('csv'))}
            {link(t('data.share'), shareAll, { hint: t('data.shareHint') })}
            {link(t('data.import'), importShared)}
            {link(t('data.exportAll'), exportEverything, { hint: t('data.exportAllHint') })}
            {link(t('data.delete'), confirmDeleteAll, { danger: true })}
          </>,
        )}

        {section(
          t('settings.about'),
          <>
            {link(t('help.title'), () => router.push('/help'))}
            {link(t('settings.rate'), () => void openStorePage().catch(() => {}))}
            {link(t('privacy.title'), () => router.push('/privacy'))}
          </>,
        )}
        <Text style={styles.version} selectable>
          {t('settings.version', { version: versionLine(i18n.language) })}
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  sectionWrap: { marginTop: 24 },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { flex: 1, gap: 4 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  dangerLabel: { color: colors.soon.fg },
  hint: { fontSize: 14, color: colors.muted },
  value: { fontSize: 16, color: colors.muted },
  chevron: { fontSize: 22, color: colors.muted },
  pad: { paddingVertical: 8 },
  link: { color: colors.primary },
  linkSmall: { fontSize: 15, fontWeight: '600', color: colors.primary },
  danger: { fontSize: 15, fontWeight: '600', color: colors.soon.fg },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.onPrimary, fontSize: 15, fontWeight: '800' },
  block: { gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, color: colors.text },
  chipTextSelected: { color: colors.onPrimary, fontWeight: '600' },
  error: { fontSize: 14, color: colors.soon.fg },
  version: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 24 },
  secondary: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
});
