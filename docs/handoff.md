# Handoff: where Warrantly stands

Written at the end of the cloud session (Nov 2026) so a local Claude Code session can pick up the work.

## Prompt to paste into the local session

```
Read AGENTS.md, README.md and docs/handoff.md first. Work on branch ccr-c9f4753e-t639so.
All features are done and tested. The next job is the visual/styling pass described in
docs/handoff.md under "Next: visual pass". Don't change behaviour while restyling. Run
tsc, tests and lint before saying a step is done. Commit and push after each step.
Don't open a pull request unless I ask.
```

## State

- Branch `ccr-c9f4753e-t639so`, pushed. No pull request.
- App version 0.8.1 (`app.json`), installed on the owner's Android phone as an EAS "preview" APK.
- Every feature in `docs/brainstorm.md` and the follow-up list is built. README "Status" lists each one.
- Device tests (GitHub Actions emulator + Maestro) pass for all flows: main, share, shortcut, cleanup, lock, fp-enroll + fingerprint (enrols an emulator finger, then cold-starts and unlocks by finger).
- The owner's last on-phone check said everything works: Gmail sync, Drive backup, widget, PDF viewer, scanning.

## Stack

- Expo SDK 58, React Native 0.88, expo-router (routes in `src/app/`), TypeScript, SQLite.
- Android first. The owner has no Mac, so iOS is untested.
- i18n: English and Hungarian (`src/i18n/en.json`, `hu.json`). A test checks both files have the same keys, so add every new string to both.
- `*.web.ts` files are stubs so the app can render in a browser for quick UI checks (`npx expo start --web`).
- Local native modules: `modules/google-account-token` (Android account token for Gmail/Drive) and `modules/pdf-pages` (PdfRenderer for the in-app PDF viewer).
- Config plugin `plugins/withShortcuts.js` adds Android home-screen shortcuts.
- `patches/expo-share-intent+9.0.0.patch` (applied by `postinstall`) fixes a crash when a shared file has no readable info.
- Theme: `src/theme.ts` picks a palette at startup (`colors`, `isDark`, `lightColors` for the widget). Changing the theme restarts the app.

## Commands

```bash
npm install                   # also applies the patch
npx tsc --noEmit              # typecheck
npm test                      # node --test, 73 tests
npx expo lint
npx expo start                # dev server
```

### Shipping to the phone

- JS-only changes go out as an over-the-air update. The phone picks it up after two restarts:
  `npx eas-cli@latest update --channel preview --environment preview --platform android --message "..."`
- Native changes (new native library, `app.json` plugin changes, version bump) need a new APK: `npx eas-cli@latest build --profile preview --platform android`.
  The EAS free plan's Android builds are used up until **Dec 1 2026**.
- Updates only reach builds with the same `runtimeVersion`, which is the app version (0.8.1). Don't bump the version unless a new APK will be built.

### Device tests

- `.github/workflows/device-test.yml` builds an x86_64 APK from source on GitHub, boots an API 34 emulator and runs `.maestro/run.sh`.
- Run it from the Actions tab (workflow_dispatch). Screenshots and logs are in the `device-test` artifact.
- Flows live in `.maestro/*.yaml`. The home screen is detected by the "Search warranties" text, so update the flows if that text changes.

## Decisions the owner made

- Warranty names are shortened to at most 3 words in lists (`displayName` in `src/components/WarrantyRow.tsx`).
- Home is Gmail-like: a search bar with a ☰ side menu (`src/components/SideMenu.tsx`) and an avatar that opens Settings. Below it are the tabs Active, Expiring soon and Expired, plus a "+ Add" button.
- Settings uses cards: accounts, Reminders (checklist + "Time" row, no "at"), Privacy and security, App, Backup, Your data, Help and about. Version is at the bottom.
- App lock: a PIN plus optional fingerprint. It relocks after 3 minutes in the background. A theme restart doesn't relock: `allowRelaunchWithoutLock` in `src/lock/store.ts` gives a 30-second pass. On the lock screen the fingerprint prompt opens by itself once the app is in front. If Android (not the person) closes it, it retries once and writes a note to the error log in Help (`src/components/LockScreen.tsx`). The owner confirmed on the phone that this works.
- It must be easy for both young and old people: big touch targets, plain words.
- Privacy: no user name or email in fixtures, external requests or commits.

## Next: visual pass

The owner wants this now. Known items:

- The "Expiring soon" tab label is cut off ("Expiring s...") on a normal phone width.
- The PDF viewer's "Open in another app" button overflows on narrow screens (`src/app/document.tsx`).
- Overall look: spacing, type sizes, colours and dark mode. Check against the screens in the latest device-test artifact.

## Not tested on a real phone yet

- Return-window reminders (14 days for online orders, reminder 2 days before) are only covered by unit tests.
- "Rate the app" needs the Play Store listing.
- Before and after a release, recheck Gmail sync, Drive backup and the widget on the phone. The emulator can't sign in to Google.
