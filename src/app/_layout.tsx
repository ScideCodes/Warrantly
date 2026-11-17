import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { addInbox } from '@/db/features.ts';
import { emailToDocument, fileToDocument, deleteDocuments, textToDocument } from '@/documents';
import { setLockShowing, syncScreenCapture } from '@/lock/gate';
import { UndoHost } from '@/components/UndoHost';
import { StatusBar } from 'expo-status-bar';
import { useLocales } from 'expo-localization';
import i18n, { appLanguage } from '@/i18n';
import { LockScreen } from '@/components/LockScreen';
import { DialogHost, showAlert } from '@/components/Dialog';
import { shouldRelock } from '@/lock/pin.ts';
import { isLockEnabled, takeRelaunchPass } from '@/lock/store';
import { getDb } from '@/db/client';
import { updateWidget } from '@/widget';
import { useReminderTaps } from '@/reminders';
import { colors, useTheme } from '@/theme';


// A screen opened by a link (widget tap) gets the home screen under it, so Back lands there.
export const unstable_settings = { anchor: 'index' };

// Share into Warrantly (section 18, shortlist 16): a PDF, photo, mail (.eml) or text sent from another app is stored at once in
// the document inbox, so it survives the app closing; the inbox then offers to add or attach it. The same
// share delivered twice (Android re-sends an intent after a restart) is taken in once.
function SharedFiles() {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  useEffect(() => {
    if (error) showAlert(i18n.t('share.failed'), error); // e.g. the sending app gave no access to the file
  }, [error]);
  useEffect(() => {
    const file = shareIntent.files?.[0];
    const text = shareIntent.text?.trim();
    if (!hasShareIntent || (!file && !text)) return;
    resetShareIntent();
    // A mail's text selected and shared (no mail account needed), or a mail saved as an .eml file.
    const email = !!file && (file.mimeType === 'message/rfc822' || /\.eml$/i.test(file.fileName));
    const sourceKey = file ? `${file.path}|${file.fileName}|${file.size ?? ''}` : `text|${text!.length}|${text!.slice(0, 200)}`;
    void (async () => {
      const db = await getDb();
      const doc = !file
        ? await textToDocument(text!, text!.split('\n')[0])
        : email ? await emailToDocument(file.path, file.fileName) : { ...(await fileToDocument(file.path, file.fileName, file.mimeType)), filename: file.fileName };
      if (!(await addInbox(db, { local_path: doc.localPath, text: doc.text, filename: doc.filename, source_key: sourceKey }))) deleteDocuments([doc.localPath]);
      router.push('/inbox');
    })().catch((e) => showAlert(i18n.t('share.failed'), e instanceof Error ? e.message : String(e)));
  }, [hasShareIntent, shareIntent, resetShareIntent]);
  return null;
}

export default function RootLayout() {
  // Headers, screen backgrounds, the root view behind them and the status bar follow the live palette.
  const { dark, version } = useTheme();
  const navTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: colors.bg, card: colors.bg, text: colors.ink, primary: colors.tint, border: colors.line } };
  }, [dark, version]); // eslint-disable-line react-hooks/exhaustive-deps -- colors is updated in place
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [version]);
  // Android can change the language while the app runs; follow it.
  useReminderTaps();

  // App lock (section 19): locked on every cold start; again after more than 3 minutes in the background.
  const [locked, setLocked] = useState(() => {
    const on = isLockEnabled() && !takeRelaunchPass();
    setLockShowing(on); // before any screen's first effect (a shortcut's scan waits for it)
    return on;
  });
  const unlock = useCallback(() => setLocked(false), []); // stable, so the lock screen's fingerprint prompt starts once
  const hiddenAt = useRef<number | null>(null);
  // Covers the app while it is in the background; inside the 3-minute grace it is lifted without the PIN.
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        hiddenAt.current = Date.now();
        if (isLockEnabled()) setCovered(true);
        void getDb().then(updateWidget).catch((e) => console.warn('widget', e)); // the home screen shows it next
      }
      if (state === 'active') {
        if (isLockEnabled() && shouldRelock(hiddenAt.current, Date.now())) setLocked(true);
        setCovered(false);
        hiddenAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);
  useLayoutEffect(() => setLockShowing(locked), [locked]); // before paint, so no sheet window shows over the lock for a frame
  // The PIN is set on its own screen and cleared in Settings; check again after each navigation.
  const pathname = usePathname();
  useEffect(() => void syncScreenCapture(), [pathname]);
  const locales = useLocales();
  useEffect(() => {
    i18n.changeLanguage(appLanguage()); // the phone's language changed; a language chosen in Settings stays
  }, [locales]);

  return (
    <ShareIntentProvider>
      <ThemeProvider value={navTheme}>
        <SharedFiles />
        <StatusBar style={dark ? 'light' : 'dark'} />
        {/* Tablets and wide screens: screens keep a readable width, centred. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: colors.bg } }}>
          <Stack.Screen name="index" options={{ title: 'Warrantly' }} />
        </Stack>
        <UndoHost />
        {locked && <LockScreen onUnlock={unlock} />}
        <DialogHost />
        {covered && <View style={[StyleSheet.absoluteFill, { zIndex: 2000, elevation: 2000, backgroundColor: colors.bg }]} />}
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
