# Warrantly

Phone app (Expo, iOS + Android) that finds purchase and warranty emails and tracks how many
days of warranty are left. Everything stays on the device. Full plan: [docs/brainstorm.md](docs/brainstorm.md).

## Status

- Step 1 (Gmail fetch + parsing prototype): done.
- Step 2 (Expo app, English/Hungarian, username screen): done. Routes live in `src/app`.
  The app follows the phone language; Android 13+ also offers a per-app language in system settings.

- `parseEmail(message, storeRules)` takes a provider-neutral `MailMessage` and returns
  `complete`, `needs_input` or `ignored`, plus kind `purchase` / `return` / `ignored`.
- English and Hungarian keyword sets live in `src/parser/keywords.ts`, one entry per language.
- Test fixtures in `src/parser/fixtures/emails.json` are real emails, anonymized.
- `src/mail`: the mail layer. `MailProvider` is the provider interface (list, read, download
  attachment); `gmailProvider` implements it on the Gmail REST API with an access token from
  `expo-auth-session`. `htmlToText` turns shop HTML into text that keeps the table layout.
  `fetchAndParse` runs one sync pass. HTML fixtures in `src/mail/fixtures` are real, anonymized.

## Run on an Android phone

1. Install **Expo Go** from Google Play (it must support Expo SDK 58).
2. On your computer (Node 22.18 or newer):

   ```sh
   npm install
   npx expo start
   ```
3. Scan the QR code with Expo Go. Phone and computer must be on the same Wi-Fi
   (or run `npx expo start --tunnel`).

## Checks

```sh
npm test            # parser, Gmail adapter, translation key parity
npm run typecheck
npx expo lint
```
