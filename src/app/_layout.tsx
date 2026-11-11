import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useLocales } from 'expo-localization';
import i18n, { pickLanguage } from '@/i18n';
import { LockScreen } from '@/components/LockScreen';
import { shouldRelock } from '@/lock/pin.ts';
import { isLockEnabled } from '@/lock/store';
import { useReminderTaps } from '@/reminders';

export default function RootLayout() {
  // Android can change the language while the app runs; follow it.
  useReminderTaps();

  // App lock (section 19): locked on every cold start; again after more than 3 minutes in the background.
  const [locked, setLocked] = useState(isLockEnabled);
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') hiddenAt.current = Date.now();
      if (state === 'active') {
        if (isLockEnabled() && shouldRelock(hiddenAt.current, Date.now())) setLocked(true);
        hiddenAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);
  const locales = useLocales();
  useEffect(() => {
    i18n.changeLanguage(pickLanguage(locales[0]?.languageCode));
  }, [locales]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </>
  );
}
