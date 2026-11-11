# Warrantly

Phone app (Expo, iOS + Android) that finds purchase and warranty emails and tracks how many
days of warranty are left. Everything stays on the device. Full plan: [docs/brainstorm.md](docs/brainstorm.md).

## Status

Build step 1 of the plan (Gmail fetch + parsing prototype) is done. No app yet.

- `parseEmail(message, storeRules)` takes a provider-neutral `MailMessage` and returns
  `complete`, `needs_input` or `ignored`, plus kind `purchase` / `return` / `ignored`.
- English and Hungarian keyword sets live in `src/parser/keywords.ts`, one entry per language.
- Test fixtures in `src/parser/fixtures/emails.json` are real emails, anonymized.
- `src/mail`: the mail layer. `MailProvider` is the provider interface (list, read, download
  attachment); `gmailProvider` implements it on the Gmail REST API with an access token from
  `expo-auth-session`. `htmlToText` turns shop HTML into text that keeps the table layout.
  `fetchAndParse` runs one sync pass. HTML fixtures in `src/mail/fixtures` are real, anonymized.

## Run

Needs Node 22.18 or newer (runs TypeScript directly).

```sh
npm install
npm test
npm run typecheck
```
