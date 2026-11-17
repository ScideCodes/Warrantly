# Releasing

Warrantly ships in two ways.

- **Over the air.** JavaScript and asset changes reach compatible installed builds on the `preview` channel without a new
  APK. The runtime version equals the app version in `app.json`.
- **New build.** Native code changes need a new `version` in `app.json`, then an APK from the
  **Release APK** workflow (`.github/workflows/release-apk.yml`, run it from the Actions tab). Download the
  `warrantly-apk` artifact and attach it to the GitHub release.

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

## Signing

- APKs are built on GitHub Actions, not EAS: the EAS free plan ran out of Android builds in November 2026, and Actions
  minutes are free now that the repository is public.
- The release key for `dev.warrantly.app` is `warrantly-release.jks` (alias `warrantly`), kept outside the repository
  in the maintainer's `Documents/Warrantly keys` folder with its password. Keep an offline copy: an APK update signed
  with any other key will not install over 1.0.0.
- The workflow reads it from the repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and
  `ANDROID_KEY_ALIAS`.
- Its SHA-1 `38:56:43:77:E1:64:1E:59:AD:9E:B5:97:D4:01:F4:50:71:85:9F:24` is registered as the Android OAuth client
  "Warrantly Release" in Cloud project `warrantly-514408`; Drive sign-in fails in builds signed with any other key.
- EAS also holds a keystore for `dev.warrantly.app` that it generated in November 2026. It was never used for a
  published APK. Before building on EAS again, upload `warrantly-release.jks` with `npx eas-cli@latest credentials`.

## Release checks

- No keys, tokens, keystores or real mail in the tree or in history (checked again for 0.9.0, 14 Nov 2026).
- Security review for 0.9.0: links from stored data open only web, mail and phone addresses; Android app backup is
  off; reminder text is hidden on a locked screen; imported files and backups are size- and type-checked.
- Known, not shipped in the app: a moderate `minimatch` advisory in Expo's build-time fingerprint tool.
- The Google web client ID in `src/google.ts` is a public identifier that ships inside the app.
- Fixtures use placeholders (`user@example.com`, "Teszt Elek", "Minta utca").
- Licence: MIT (`LICENSE`).
