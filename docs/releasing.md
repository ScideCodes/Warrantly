# Releasing

Warrantly ships in two ways.

- **Over the air.** JavaScript and asset changes reach installed beta builds on the `preview` channel without a new
  APK. The runtime version equals the app version in `app.json`.
- **New build.** Native code changes need a new `version` in `app.json`, then an APK
  (`npx eas-cli@latest build --platform android --profile preview`).

## Every update gets a GitHub release

```sh
scripts/ota-release.sh "What changed, in plain words"
```

The script checks that the commit is pushed, publishes the update, and creates the pre-release `v<version>-beta.<n>`
with the update group in its notes. Use `DRAFT=1` to review a release before it goes live.

The first release of each app version also carries the installable APK:

```sh
scripts/ota-release.sh "First beta" path/to/app.apk
```

## Before the repository goes public

- No keys, tokens, keystores or real mail in the tree or in history (checked again for 0.9.0, 14 Nov 2026).
- Security review for 0.9.0: links from stored data open only web, mail and phone addresses; Android app backup is
  off; reminder text is hidden on a locked screen; imported files and backups are size- and type-checked.
- Known, not shipped in the app: a moderate `minimatch` advisory in Expo's build-time fingerprint tool.
- The Google web client ID in `src/google.ts` is a public identifier that ships inside the app.
- Fixtures use placeholders (`user@example.com`, "Teszt Elek", "Minta utca").
- Pick a licence.
