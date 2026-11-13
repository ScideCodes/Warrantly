import { Pressable, Text, View } from '@/components/themeMotion';
import { Children, cloneElement, Fragment, isValidElement, useCallback, useState, type ReactElement, type ReactNode } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import AppIcon, { type IconName } from '@/components/Icon';
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
import { getDensity, setDensity, type Density } from '@/settings';
import { forgetRecent } from '@/recentStore';
import { getUsername, getLanguageSetting, getThemeSetting, setLanguageSetting, setThemeSetting, getReminderGroups, getReminderTime, getRemindersEnabled, getReturnRemindersEnabled, getSetting, setReminderGroups, setReminderTime, setRemindersEnabled, setReturnRemindersEnabled, setSetting, setWidgetNames, settingsSnapshot } from '@/settings';
import { updateWidget, widgetShowsNames } from '@/widget';
import { Page } from '@/components/Page';
import { showAlert } from '@/components/Dialog';
import { Button, Group, IconTile, Row, SectionHeader, Segmented, Switch, TILE } from '@/components/ui';
import { applyTheme, colors, RADIUS, ROW_X, TYPE, themed } from '@/theme';
import { ALL_GROUPS, type ReminderGroup } from '@/warranty';

const INTERVALS: BackupInterval[] = ['weekly', 'monthly', '3m', '6m'];
type Icon = IconName;

// Settings (section 13): mail accounts, app lock, reminders and backup.
export default function Settings() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const [lock, setLock] = useState(isLockEnabled);
  const [biometric, setBiometric] = useState(isBiometricEnabled);
  const [canBiometric, setCanBiometric] = useState(false);
  const [reminders, setReminders] = useState(getRemindersEnabled);
  const [returnReminders, setReturnReminders] = useState(getReturnRemindersEnabled);
  const [time, setTime] = useState(getReminderTime);
  const [language, setLanguage] = useState(getLanguageSetting);
  const [theme, setTheme] = useState(getThemeSetting);
  const [density, setDensityState] = useState<Density>(getDensity);
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

  // Applies at once: the palette is live, so Settings stays open where it was (no restart, no update).
  function chooseTheme(next: string) {
    setThemeSetting(next);
    setTheme(next);
    applyTheme();
    void getDb().then(updateWidget).catch(() => {}); // the widget follows the app's appearance
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
      return showAlert(t('accounts.needPassword'), undefined, [
        { text: t('restore.cancel'), style: 'cancel' },
        { text: t('accounts.setPassword'), onPress: () => router.push({ pathname: '/backup-password', params: { purpose: 'disconnect' } }) },
      ]);
    }
    showAlert(t('accounts.confirmTitle', { email: account.email }), t('accounts.confirmBody'), [
      { text: t('restore.cancel'), style: 'cancel' },
      {
        text: t('accounts.disconnect'),
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          try {
            await disconnectAccount(db, account);
            showAlert(t('accounts.done', { email: account.email }));
          } catch (e) {
            showAlert(e instanceof Error ? e.message : String(e));
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
      showAlert(e instanceof Error ? e.message : String(e));
    }
  }

  async function exportEverything() {
    try {
      const data = await dumpDb(await getDb(), settingsSnapshot());
      await shareText(`warrantly-all-data-${data.createdAt.slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (e) {
      showAlert(e instanceof Error ? e.message : String(e));
    }
  }

  async function shareAll() {
    try {
      const db = await getDb();
      const ids = (await listWarranties(db, 'complete')).map((w) => w.id);
      await shareWarranties(db, ids, `warrantly-shared-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : String(e));
    }
  }

  async function importShared() {
    try {
      const db = await getDb();
      const added = await importSharedFile(db);
      if (added !== null) showAlert(t('data.imported', { count: added }));
      await rescheduleReminders(db);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : String(e));
    }
  }

  function confirmDeleteAll() {
    const run = async (drive: boolean) => {
      try {
        await deleteAllData(await getDb(), drive);
        await restartIntoUpdate().catch(() => router.replace('/onboarding')); // starts fresh, like a new install
      } catch (e) {
        showAlert(e instanceof Error ? e.message : String(e));
      }
    };
    showAlert(t('data.deleteTitle'), t('data.deleteBody'), [
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

  // The reference's settings rows (`.settings-group`): a 29dp colour tile with a white glyph, the label, then a
  // switch, a value or a chevron. Separators start at 59, after the tile.
  const row = (icon: Icon, tint: string, label: string, hint: string | null, value: boolean, onChange: (v: boolean) => void) => (
    <Row key={label} iconInset style={styles.row}>
      <IconTile name={icon} color={tint} />
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </Row>
  );
  const link = (icon: Icon, tint: string, label: string, onPress: () => void, opts: { hint?: string; danger?: boolean; value?: string } = {}) => (
    <Row key={label} iconInset style={styles.row} onPress={onPress} chevron={!opts.danger}>
      <IconTile name={icon} color={tint} />
      <View style={styles.rowText}>
        <Text style={[styles.label, opts.danger && { color: colors.bad }]}>{label}</Text>
        {opts.hint && <Text style={styles.hint}>{opts.hint}</Text>}
      </View>
      {opts.value && <Text style={styles.value}>{opts.value}</Text>}
    </Row>
  );
  // Choices in a row block: the label, then the Large segmented control (the reference's appearance picker).
  const choices = (icon: Icon, tint: string, label: string, items: { key: string; label: string; icon?: Icon }[], selected: string, onPick: (key: string) => void) => (
    <Row key={label} iconInset style={styles.block}>
      <View style={styles.blockHead}>
        <IconTile name={icon} color={tint} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Segmented large options={items} value={selected} onChange={onPick} />
    </Row>
  );
  const name = getUsername();
  // One group per topic, with the reference's section header above it.
  const section = (title: string, body: ReactNode) => (
    <View>
      <SectionHeader title={title} />
      <Group>{Children.toArray(isValidElement<{ children?: ReactNode }>(body) && body.type === Fragment ? body.props.children : body).filter(isValidElement).map((child, i) => cloneElement(child as ReactElement<{ separator?: boolean }>, { separator: i > 0 }))}</Group>
    </View>
  );

  return (
    <Page title={t('settings.title')}>
      {/* The reference's profile row: a 48dp grey avatar, the name in Title 3 and a Subheadline hint. */}
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(name?.trim()[0] ?? 'W').toUpperCase()}</Text>
        </View>
        <View style={styles.rowText}>
          <Text style={styles.profileName} numberOfLines={1}>
            {name?.trim() || t('settings.title')}
          </Text>
          <Text style={styles.profileHint}>{t('settings.profileHint')}</Text>
        </View>
      </View>

      {section(
        t('accounts.section'),
        <>
          {accounts.map((a) => (
            <Row key={a.id} iconInset style={styles.row}>
              <IconTile name="mail-outline" color={TILE.blue} />
              <View style={styles.rowText}>
                <Text style={styles.label}>{a.email}</Text>
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
                    <Text style={[styles.linkSmall, { color: colors.bad }]}>{t('accounts.disconnect')}</Text>
                  </Pressable>
                </View>
              </View>
            </Row>
          ))}
          <Row key="add" iconInset style={styles.row} onPress={addAccount}>
            <IconTile name="add" color={TILE.green} />
            <Text style={[styles.label, styles.rowText, { color: colors.link }]}>{t('accounts.add')}</Text>
          </Row>
          {accountBusy && (
            <Row key="busy" iconInset>
              <Text style={styles.hint}>{accountBusy}</Text>
            </Row>
          )}
          {link('eye-off-outline', TILE.grey, t('ignored.title'), () => router.push('/ignored'))}
        </>,
      )}

      {section(
        t('settings.remindersSection'),
        <>
          {row('notifications-outline', TILE.red, t('settings.reminders'), t('settings.remindersHint'), reminders, toggleReminders)}
          {reminders &&
            ALL_GROUPS.map((g) => (
              // The reference's to-do circles: 22dp, --ink-3 ring, filled with the tint when on.
              <Row key={g} iconInset style={styles.row} onPress={() => toggleGroup(g)} accessibilityRole="checkbox" accessibilityState={{ checked: groups.includes(g) }}>
                <View style={styles.tileSpace}>
                  <View style={[styles.check, groups.includes(g) && styles.checkOn]}>{groups.includes(g) && <AppIcon name="checkmark" size={15} color="#fff" />}</View>
                </View>
                <Text style={[styles.label, styles.rowText]}>{t(`settings.group_${g}`)}</Text>
              </Row>
            ))}
          {reminders && link('time-outline', TILE.orange, t('settings.reminderTime'), pickTime, { value: timeLabel })}
          {reminders && row('return-down-back-outline', TILE.purple, t('settings.returnReminders'), t('settings.returnRemindersHint'), returnReminders, toggleReturnReminders)}
        </>,
      )}

      {section(
        t('settings.general'),
        <>
          {choices(
            'contrast-outline',
            TILE.indigo,
            t('settings.theme'),
            [
              { key: 'light', label: t('settings.theme_light'), icon: 'sunny-outline' },
              { key: 'dark', label: t('settings.theme_dark'), icon: 'moon-outline' },
              { key: 'system', label: t('settings.theme_system'), icon: 'phone-portrait-outline' },
            ],
            theme,
            chooseTheme,
          )}
          {choices(
            'list-outline',
            TILE.teal,
            t('settings.density'),
            [
              { key: 'comfortable', label: t('settings.density_comfortable') },
              { key: 'compact', label: t('settings.density_compact') },
            ],
            density,
            (d: string) => { setDensity(d as Density); setDensityState(d as Density); },
          )}
          {choices('globe-outline', TILE.blue, t('settings.language'), ['system', ...Object.keys(resources)].map((key) => ({ key, label: t(`settings.lang_${key}`) })), language, chooseLanguage)}
        </>,
      )}

      {section(
        t('settings.security'),
        <>
          {row('lock-closed-outline', TILE.grey, t('settings.lock'), t('settings.lockHint'), lock, toggleLock)}
          {lock && link('keypad-outline', TILE.grey, t('settings.changePin'), () => router.push('/pin'))}
          {lock && canBiometric && row('finger-print-outline', TILE.red, t('settings.biometric'), null, biometric, toggleBiometric)}
          {Platform.OS === 'android' && row('apps-outline', TILE.indigo, t('settings.widgetNames'), t('settings.widgetNamesHint'), widgetNames, toggleWidgetNames)}
          {link('time-outline', TILE.grey, t('recent.clear'), () => { forgetRecent(); showAlert(t('recent.cleared')); }, { hint: t('recent.clearHint') })}
        </>,
      )}

      {section(
        t('backup.section'),
        <>
          {row('cloud-upload-outline', TILE.cyan, t('backup.enable'), t('backup.enableHint'), backup, toggleBackup)}
          {backup && (
            <Row key="interval" iconInset style={styles.block}>
              <Text style={styles.label}>{t('backup.interval')}</Text>
              <Segmented
                options={INTERVALS.map((i) => ({ key: i, label: t(`backup.${i}`) }))}
                value={interval}
                onChange={(i) => {
                  setSetting('backup_interval', i);
                  setIntervalChoice(i);
                }}
              />
              <Text style={backupError ? styles.error : styles.hint}>
                {backupBusy
                  ? t('backup.working')
                  : backupError
                    ? t('backup.failed', { detail: backupError })
                    : lastBackup
                      ? t('backup.last', { date: new Date(lastBackup).toLocaleString(i18n.language) })
                      : t('backup.never')}
              </Text>
              <Button kind="glass" title={t('backup.now')} onPress={backupNow} busy={backupBusy} />
            </Row>
          )}
          <Row key="account" iconInset style={styles.row}>
            <IconTile name="person-circle-outline" color={TILE.grey} />
            <View style={styles.rowText}>
              <Text style={styles.label}>{t('backup.account')}</Text>
              <Text style={styles.hint} numberOfLines={1}>
                {backupAccount ?? t('backup.accountNone')}
              </Text>
            </View>
            <Pressable onPress={changeBackupAccount} disabled={backupBusy} accessibilityRole="button" accessibilityLabel={`${t('backup.account')}: ${t('backup.change')}`} hitSlop={8}>
              <Text style={styles.linkSmall}>{t('backup.change')}</Text>
            </Pressable>
          </Row>
          {link('pulse-outline', TILE.green, t('health.title'), () => router.push('/backup-status'))}
          {link('cloud-download-outline', TILE.cyan, t('backup.restore'), () => router.push('/restore'))}
        </>,
      )}

      {section(
        t('data.section'),
        <>
          {link('document-text-outline', TILE.red, t('data.exportPdf'), () => exportList('pdf'))}
          {link('grid-outline', TILE.green, t('data.exportCsv'), () => exportList('csv'))}
          {link('share-social-outline', TILE.blue, t('data.share'), shareAll, { hint: t('data.shareHint') })}
          {link('download-outline', TILE.teal, t('data.import'), importShared)}
          {link('archive-outline', TILE.orange, t('data.exportAll'), exportEverything, { hint: t('data.exportAllHint') })}
          {link('trash-outline', TILE.red, t('data.delete'), confirmDeleteAll, { danger: true })}
        </>,
      )}

      {section(
        t('settings.about'),
        <>
          {link('help-circle-outline', TILE.blue, t('help.title'), () => router.push('/help'))}
          {link('star-outline', TILE.yellow, t('settings.rate'), () => void openStorePage().catch(() => {}))}
          {link('shield-checkmark-outline', TILE.grey, t('privacy.title'), () => router.push('/privacy'))}
        </>,
      )}
      <Text style={styles.version} selectable>
        {t('settings.version', { version: versionLine(i18n.language) })}
      </Text>
    </Page>
  );
}

const useStyles = themed(() => StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: ROW_X, borderRadius: RADIUS, backgroundColor: colors.card, marginTop: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tintSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 21, lineHeight: 24, fontWeight: '600', color: colors.tintInk },
  profileName: { ...TYPE.title3, color: colors.ink },
  profileHint: { ...TYPE.sub, color: colors.ink2 },
  row: { gap: 15 },
  rowText: { flex: 1 },
  tileSpace: { width: 29, alignItems: 'center' },
  label: { ...TYPE.body, color: colors.ink },
  hint: { ...TYPE.foot, color: colors.ink2 },
  value: { ...TYPE.body, color: colors.ink2 },
  inlineLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 4, marginTop: 4 },
  linkSmall: { ...TYPE.sub, color: colors.link },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.ink3, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.tint, borderColor: colors.tint },
  block: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  error: { ...TYPE.foot, color: colors.bad },
  version: { ...TYPE.cap, color: colors.ink2, textAlign: 'center', paddingTop: 24 },
}));
