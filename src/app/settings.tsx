import { useCallback, useState, type ReactNode } from 'react';
import { router, Stack, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { getUsername, getLanguageSetting, getThemeSetting, setLanguageSetting, setThemeSetting, getReminderGroups, getReminderTime, getRemindersEnabled, getReturnRemindersEnabled, getSetting, setReminderGroups, setReminderTime, setRemindersEnabled, setReturnRemindersEnabled, setSetting, setWidgetNames, settingsSnapshot } from '@/settings';
import { updateWidget, widgetShowsNames } from '@/widget';
import { colors, BUTTON_HEIGHT, BUTTON_RADIUS } from '@/theme';
import { ALL_GROUPS, type ReminderGroup } from '@/warranty';


const INTERVALS: BackupInterval[] = ['weekly', 'monthly', '3m', '6m'];
type Icon = keyof typeof Ionicons.glyphMap;

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

  // A small tinted square with an icon at the start of each row, so rows are easy to tell apart.
  const tile = (icon: Icon, danger = false) => (
    <View style={[styles.tile, danger && styles.tileDanger]}>
      <Ionicons name={icon} size={22} color={danger ? colors.soon.fg : colors.muted} />
    </View>
  );
  const row = (icon: Icon, label: string, hint: string | null, value: boolean, onChange: (v: boolean) => void) => (
    <View style={styles.row}>
      {tile(icon)}
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor={value ? colors.onPrimary : colors.surface}
      />
    </View>
  );
  const link = (icon: Icon, label: string, onPress: () => void, opts: { hint?: string; danger?: boolean; value?: string } = {}) => (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      {tile(icon, opts.danger)}
      <View style={styles.rowText}>
        <Text style={[styles.label, opts.danger && styles.dangerLabel]}>{label}</Text>
        {opts.hint && <Text style={styles.hint}>{opts.hint}</Text>}
      </View>
      {opts.value && <Text style={styles.value}>{opts.value}</Text>}
      {!opts.danger && <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
    </Pressable>
  );
  // Segmented control: every choice visible at once, the chosen one filled.
  const segmented = (label: string, items: { key: string; text: string }[], selected: string, onPick: (key: string) => void) => (
    <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {items.map((it) => (
        <Pressable
          key={it.key}
          style={[styles.segItem, selected === it.key && styles.segItemOn]}
          onPress={() => onPick(it.key)}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === it.key }}
        >
          <Text style={[styles.segText, selected === it.key && styles.segTextOn]}>
            {it.text}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  const choices = (icon: Icon, label: string, items: { key: string; text: string }[], selected: string, onPick: (key: string) => void) => (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        {tile(icon)}
        <Text style={styles.label}>{label}</Text>
      </View>
      {segmented(label, items, selected, onPick)}
    </View>
  );
  const name = getUsername();
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
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(name?.trim()[0] ?? 'W').toUpperCase()}</Text>
          </View>
          <View style={styles.rowText}>
            <Text style={styles.profileName} numberOfLines={1}>
              {name?.trim() || t('settings.title')}
            </Text>
            <Text style={styles.hint}>{t('settings.profileHint')}</Text>
          </View>
        </View>

        {section(
          t('accounts.section'),
          <>
            {accounts.map((a) => (
              <View key={a.id} style={styles.row}>
                {tile('mail-outline')}
                <View style={styles.rowText}>
                  <Text style={styles.label}>
                    {a.email}
                  </Text>
                  <View style={styles.inlineLinks}>
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
                </View>
              </View>
            ))}
            <Pressable style={styles.row} onPress={addAccount} accessibilityRole="button">
              {tile('add')}
              <Text style={[styles.label, styles.link, styles.rowText]}>{t('accounts.add')}</Text>
            </Pressable>
            {accountBusy && <Text style={[styles.hint, styles.pad]}>{accountBusy}</Text>}
            {link('eye-off-outline', t('ignored.title'), () => router.push('/ignored'))}
          </>,
        )}

        {section(
          t('settings.remindersSection'),
          <>
            {row('notifications-outline', t('settings.reminders'), t('settings.remindersHint'), reminders, toggleReminders)}
            {reminders && (
              <>
                {ALL_GROUPS.map((g) => (
                  <Pressable
                    key={g}
                    style={[styles.row, styles.subRow]}
                    onPress={() => toggleGroup(g)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: groups.includes(g) }}
                  >
                    <Text style={[styles.label, styles.rowText]}>{t(`settings.group_${g}`)}</Text>
                    <View style={[styles.check, groups.includes(g) && styles.checkOn]}>
                      {groups.includes(g) && <Ionicons name="checkmark" size={18} color={colors.onPrimary} />}
                    </View>
                  </Pressable>
                ))}
                {link('time-outline', t('settings.reminderTime'), pickTime, { value: timeLabel })}
                {row('return-down-back-outline', t('settings.returnReminders'), t('settings.returnRemindersHint'), returnReminders, toggleReturnReminders)}
              </>
            )}
          </>,
        )}

        {section(
          t('settings.general'),
          <>
            {choices('contrast-outline', t('settings.theme'), ['light', 'dark', 'system'].map((key) => ({ key, text: t(`settings.theme_${key}`) })), theme, chooseTheme)}
            {choices('globe-outline', t('settings.language'), ['system', ...Object.keys(resources)].map((key) => ({ key, text: t(`settings.lang_${key}`) })), language, chooseLanguage)}
          </>,
        )}

        {section(
          t('settings.security'),
          <>
            {row('lock-closed-outline', t('settings.lock'), t('settings.lockHint'), lock, toggleLock)}
            {lock && link('keypad-outline', t('settings.changePin'), () => router.push('/pin'))}
            {lock && canBiometric && row('finger-print-outline', t('settings.biometric'), null, biometric, toggleBiometric)}
            {Platform.OS === 'android' && row('apps-outline', t('settings.widgetNames'), t('settings.widgetNamesHint'), widgetNames, toggleWidgetNames)}
          </>,
        )}

        {section(
          t('backup.section'),
          <>
            {row('cloud-upload-outline', t('backup.enable'), t('backup.enableHint'), backup, toggleBackup)}
            {backup && (
              <View style={styles.block}>
                <Text style={styles.label}>{t('backup.interval')}</Text>
                {segmented(
                  t('backup.interval'),
                  INTERVALS.map((i) => ({ key: i, text: t(`backup.${i}`) })),
                  interval,
                  (i) => {
                    setSetting('backup_interval', i);
                    setIntervalChoice(i as BackupInterval);
                  },
                )}
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
              {tile('person-circle-outline')}
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
            {link('cloud-download-outline', t('backup.restore'), () => router.push('/restore'))}
          </>,
        )}

        {section(
          t('data.section'),
          <>
            {link('document-text-outline', t('data.exportPdf'), () => exportList('pdf'))}
            {link('grid-outline', t('data.exportCsv'), () => exportList('csv'))}
            {link('share-social-outline', t('data.share'), shareAll, { hint: t('data.shareHint') })}
            {link('download-outline', t('data.import'), importShared)}
            {link('archive-outline', t('data.exportAll'), exportEverything, { hint: t('data.exportAllHint') })}
            {link('trash-outline', t('data.delete'), confirmDeleteAll, { danger: true })}
          </>,
        )}

        {section(
          t('settings.about'),
          <>
            {link('help-circle-outline', t('help.title'), () => router.push('/help'))}
            {link('star-outline', t('settings.rate'), () => void openStorePage().catch(() => {}))}
            {link('shield-checkmark-outline', t('privacy.title'), () => router.push('/privacy'))}
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
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, backgroundColor: colors.surface },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', color: colors.onPrimary },
  profileName: { fontSize: 18, fontWeight: '700', color: colors.text },
  sectionWrap: { marginTop: 24 },
  section: { fontSize: 14, fontWeight: '700', letterSpacing: 0.8, color: colors.muted, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  subRow: { paddingLeft: 42, minHeight: 52 },
  rowText: { flex: 1, gap: 2 },
  tile: { width: 28, alignItems: 'center' },
  tileDanger: {},
  label: { fontSize: 17, fontWeight: '600', color: colors.text },
  dangerLabel: { color: colors.soon.fg },
  hint: { fontSize: 14, color: colors.muted },
  value: { fontSize: 16, color: colors.muted },
  pad: { paddingVertical: 8 },
  link: { color: colors.primary },
  inlineLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 6 },
  linkSmall: { fontSize: 15, fontWeight: '600', color: colors.primary },
  danger: { fontSize: 15, fontWeight: '600', color: colors.soon.fg },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  block: { gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  segment: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: BUTTON_RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  segItem: { flex: 1, minHeight: 44, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segItemOn: { backgroundColor: colors.primary },
  segText: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' },
  segTextOn: { color: colors.onPrimary, fontWeight: '700' },
  error: { fontSize: 14, color: colors.soon.fg },
  version: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 24 },
  secondary: { minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_RADIUS, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
