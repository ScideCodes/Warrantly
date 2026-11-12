import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useLocales } from 'expo-localization';
import i18n, { appLanguage } from '@/i18n';
import { LockScreen } from '@/components/LockScreen';
import { shouldRelock } from '@/lock/pin.ts';
import { isLockEnabled } from '@/lock/store';
import { getDb } from '@/db/client';
import { updateWidget } from '@/widget';
import { useReminderTaps } from '@/reminders';
import { colors } from '@/theme';

// A screen opened by a link (widget tap) gets the home screen under it, so Back lands there.
export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  // Android can change the language while the app runs; follow it.
  useReminderTaps();

  // App lock (section 19): locked on every cold start; again after more than 3 minutes in the background.
  const [locked, setLocked] = useState(isLockEnabled);
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
    <>
      <StatusBar style="dark" />
      {/* Tablets and wide screens: screens keep a readable width, centred. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: colors.background } }}>
        <Stack.Screen name="index" options={{ title: 'Warrantly' }} />
      </Stack>
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </>
  );
}
