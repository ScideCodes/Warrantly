# Signed 1.0.0 APK verification

Verified 14 November 2026 using the actual signed release APK from GitHub Actions run `43568399224`.

- Built source: `0cda12d988148b119333878882acb490c55a9e26`.
- Package: `dev.warrantly.app`; version: `1.0.0`.
- APK SHA-256: `ffc9333b752eb546828e9d55910984a74c778aacadb8691b21ca3e7f411cff7e`.
- Signing certificate SHA-1 reported by the build's apksigner: `38:56:43:77:E1:64:1E:59:AD:9E:B5:97:D4:01:F4:50:71:85:9F:24`.
- The installed emulator APK was pulled back and hashed: byte-for-byte identical to the downloaded workflow artifact.

## Passed

- Typecheck and all 149 unit tests. Lint: zero errors, one existing i18next default-import warning.
- Release starts on the Android emulator without Metro.
- Gmail import is hidden in this release while restricted-scope approval is pending.
- Google Drive account selection completes with the release package/signing identity.
- Restore screen successfully calls Drive and displays the latest backup's timestamp. Existing backups were not restored, overwritten or deleted.
- A synthetic manual warranty saves, with the local fixture PDF attached.
- The document opens and renders in the native viewer; zoom control changes from 100% to 200%.
- The saved record survives force-stop and cold launch.
- No ReactNativeJS or AndroidRuntime errors were captured during these checks.

## Scope and migration

This is an emulator smoke test of the signed artifact, not full physical-device certification. New backup creation, decryption/restoration of existing user backups and every app feature were not retested here.

The application ID changed from `dev.warrantly.prototype`. Version 1.0.0 installs beside the previous beta and does not automatically inherit its local records. Keep the old app until data has been exported or an encrypted Drive backup has been restored and checked. The new runtime is `1.0.0`; an OTA for runtime `0.9.0` cannot perform this native migration.
