import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { getLanguageSetting } from '@/settings';
import en from './en.json';
import hu from './hu.json';

// One JSON file per language (brainstorm section 3). To add a language, add its file here.
export const resources = { en: { translation: en }, hu: { translation: hu } };
export type Language = keyof typeof resources;

// The phone's language if we have it, else English. Android also offers a per-app
// language in system settings (app.json supportedLocales), which shows up here too.
export function pickLanguage(code: string | null | undefined): Language {
  return code && code in resources ? (code as Language) : 'en';
}

// The language chosen in Settings, else the phone's.
export const appLanguage = (): Language => {
  const chosen = getLanguageSetting();
  return pickLanguage(chosen === 'system' ? getLocales()[0]?.languageCode : chosen);
};

i18n.use(initReactI18next).init({
  resources,
  lng: appLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

export default i18n;
