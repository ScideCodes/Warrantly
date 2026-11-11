# Warrantly

Phone app (Expo, iOS + Android) that finds purchase and warranty emails and tracks how many
days of warranty are left. Everything stays on the device. Full plan: [docs/brainstorm.md](docs/brainstorm.md).

## Status

- Step 1 (Gmail fetch + parsing prototype): done.
- Step 2 (Expo app, English/Hungarian, username screen): done. Routes live in `src/app`.
- Step 3 (local database, warranty list and detail, days-left logic): done. `src/db` holds the
  SQLite schema and sync; `src/warranty.ts` the date logic. DB tests run the same SQL on Node's
  built-in SQLite.
- Step 5 (manual add and edit, resolving "Needs your attention", store rules, ignore, delete): done.
  Mail import keeps warranty documents and mails that state a warranty length ("24 hó gar.").
- Step 6 (reminders, app lock): done. Reminders need app 0.2.0 (native build); merging of duplicate
  mails is a 60-day same-product rule for now.
- Step 7a (encrypted backup to Google Drive): done in app 0.3.0. `src/backup` holds the format
  (JSON dump, scrypt + AES-256-GCM envelope) and the Drive client; both are tested in Node.
- Step 7b (several Gmail accounts): done in app 0.4.0. `modules/google-account-token` is a small local
  Expo module (Kotlin) that gets a Gmail token for a specific account; one tab per account plus Manual.
- Step 8 (document scan + OCR, claim helper): done in app 0.5.0. ML Kit document scanner and text
  recognition on the phone; `src/parser/scan.ts` turns the text into form suggestions.
- Step 4 (mail PDFs): sync downloads PDFs and attaches them by purchase mail or order number.
- Step 9a (search and filters, Ignored screen): done. Store templates remain. Outlook is skipped for
  now (Gmail only); it would need a Microsoft app registration.
- Step 9b (app 0.6.0): import a photo or PDF from the phone (`expo-document-picker`), and an Android
  home-screen widget (`src/widget.tsx`, `react-native-android-widget`) with the next warranty to expire.
  The widget's handler runs headless, so `index.ts` registers it next to Expo Router's entry.
- App 0.7.0: documents open in the app (`src/app/document.tsx`). `modules/pdf-pages` is a small local
  Expo module that draws PDF pages with Android's PdfRenderer; zoom is 100/200/300% buttons.
  The app follows the phone language; Android 13+ also offers a per-app language in system settings.

- `parseEmail(message, storeRules)` takes a provider-neutral `MailMessage` and returns
  `complete`, `needs_input` or `ignored`, plus kind `purchase` / `return` / `ignored`.
- English and Hungarian keyword sets live in `src/parser/keywords.ts`, one entry per language.
- Test fixtures in `src/parser/fixtures/emails.json` are real emails, anonymized.
- `src/mail`: the mail layer. `MailProvider` is the provider interface (list, read, download
  attachment); `gmailProvider` implements it on the Gmail REST API with a per-account access token
  (`src/google.ts`). `htmlToText` turns shop HTML into text that keeps the table layout.
  `fetchAndParse` runs one sync pass. HTML fixtures in `src/mail/fixtures` are real, anonymized.

## Run on an Android phone

The app uses native modules (Google sign-in, document scanner, widget), so Expo Go cannot run it.
Build an APK in the cloud and install it:

```sh
npm install
npx eas-cli@latest build --platform android --profile preview
```

JavaScript-only changes reach an installed build over the air (`npx eas-cli@latest update --channel preview`).
A change that adds native code needs a new `version` in `app.json` and a new build.

## Checks

```sh
npm test            # parser, Gmail adapter, translation key parity
npm run typecheck
npx expo lint
```
