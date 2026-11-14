# Releasing

Warrantly ships in two ways.

- **Over the air.** JavaScript and asset changes reach compatible installed builds on the `preview` channel without a new
  APK. The runtime version equals the app version in `app.json`.
- **New build.** Native code changes need a new `version` in `app.json`, then an APK
  (`npx eas-cli@latest build --platform android --profile preview`).

## OTA records

```sh
scripts/ota-release.sh "What changed, in plain words"
```

The script checks that the commit is pushed, publishes the update, and creates the pre-release `v<version>-ota.<n>`
with the update group in its notes. Use `DRAFT=1` to review a release before it goes live.

The stable release of each app version carries its installable APK. OTA records are prereleases and never replace the stable release as Latest. An optional APK can be attached to an OTA record:

```sh
scripts/ota-release.sh "Update description" path/to/app.apk
```

## 1.0.0

- New application ID `dev.warrantly.app` (was `dev.warrantly.prototype`). It installs as a new app beside the beta;
  testers restore from their Drive backup. It needs its own signing key and its own Android OAuth client
  (package + SHA-1) in Google Cloud, or Drive sign-in fails.
- Gmail import is off (`GMAIL_IMPORT` in `src/features.ts`) until Google verifies the `gmail.readonly` scope. With
  it off, sign-in asks only for `drive.file`. See `docs/gmail-verification.md`.
- 1.0.0 is a full release: create it with `gh release create` without `--prerelease`, APK attached.

## Release checks

- No keys, tokens, keystores or real mail in the tree or in history (checked again for 0.9.0, 14 Nov 2026).
- Security review for 0.9.0: links from stored data open only web, mail and phone addresses; Android app backup is
  off; reminder text is hidden on a locked screen; imported files and backups are size- and type-checked.
- Known, not shipped in the app: a moderate `minimatch` advisory in Expo's build-time fingerprint tool.
- The Google web client ID in `src/google.ts` is a public identifier that ships inside the app.
- Fixtures use placeholders (`user@example.com`, "Teszt Elek", "Minta utca").
- Licence: MIT (`LICENSE`).
