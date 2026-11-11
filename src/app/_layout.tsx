import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useLocales } from 'expo-localization';
import i18n, { pickLanguage } from '@/i18n';

export default function RootLayout() {
  // Android can change the language while the app runs; follow it.
  const locales = useLocales();
  useEffect(() => {
    i18n.changeLanguage(pickLanguage(locales[0]?.languageCode));
  }, [locales]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
