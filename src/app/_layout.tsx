import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { putSharedFile } from '@/shareInbox';
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

// Share into Warrantly (section 18): a PDF or photo sent from another app opens the add form with it.
function SharedFiles() {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  useEffect(() => {
    if (error) showAlert(i18n.t('share.failed'), error); // e.g. the sending app gave no access to the file
  }, [error]);
  useEffect(() => {
    const file = shareIntent.files?.[0];
    if (!hasShareIntent || !file) return;
    putSharedFile({ uri: file.path, name: file.fileName, mimeType: file.mimeType });
    resetShareIntent();
    router.push({ pathname: '/warranty/edit', params: { shared: '1' } });
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
  const [locked, setLocked] = useState(() => isLockEnabled() && !takeRelaunchPass());
  const unlock = useCallback(() => setLocked(false), []); // stable, so the lock screen's fingerprint prompt starts once
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        hiddenAt.current = Date.now();
        void getDb().then(updateWidget).catch((e) => console.warn('widget', e)); // the home screen shows it next
      }
      if (state === 'active') {
        if (isLockEnabled() && shouldRelock(hiddenAt.current, Date.now())) setLocked(true);
        hiddenAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);
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
        {locked && <LockScreen onUnlock={unlock} />}
        <DialogHost />
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
