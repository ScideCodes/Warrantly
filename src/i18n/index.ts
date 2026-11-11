import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
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

i18n.use(initReactI18next).init({
  resources,
  lng: pickLanguage(getLocales()[0]?.languageCode),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

export default i18n;
