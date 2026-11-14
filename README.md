<div align="center">
<img src="assets/icon.png" width="88" alt="Warrantly icon" />

# Warrantly

Your warranties, receipts and expiry reminders in one private Android app.

**English & Hungarian · Light & dark · Free & open source**

[Download for Android](https://github.com/ScideCodes/Warrantly/releases/latest) · [Website](https://bencepc.hu/warrantly/) · [Privacy](https://bencepc.hu/warrantly/privacy/)
</div>

## Install

1. Open the [latest release](https://github.com/ScideCodes/Warrantly/releases/latest) on your Android phone.
2. Under **Assets**, download **Warrantly-1.0.0.apk** and open it.
3. If Android asks, allow your browser or file manager to **install unknown apps**, then install Warrantly. You can turn that permission off afterward.

No Expo Go, developer account or computer needed. Open the app, choose your language and add a purchase or scan a receipt. Compatible updates download in the app; restart when prompted. Native upgrades require a new APK.

**Moving from a 0.x beta?** Version 1.0 installs separately. Back up in the old app first, then restore in 1.0 with the same Drive account and backup password. Keep the old app until your records and documents are restored.

## What it does

- Stores warranties and receipts, counts remaining days and sends reminders.
- Scans receipts, opens PDFs and groups purchases into collections.
- Offers a home-screen widget, optional PIN/biometrics and encrypted Google Drive backup.

Gmail import is temporarily hidden while Google reviews its permission. Manual entry, scanning, file sharing and Drive backup work without Gmail access.

## Built with

**TypeScript · React Native · Expo SDK 58 · Expo Router**, with **Kotlin** for Android integrations. SQLite keeps records on your phone; documents stay locally. Optional Drive backups are encrypted on the phone with AES-256-GCM. No Warrantly server or Warrantly account.

## Run the source

Use **Node.js 22.18+** and npm:

```sh
npm ci
npm start
npm run lint
npm run typecheck
npm test
```

The app uses native scanning, Google sign-in and widget modules, so full mobile testing requires a development build; Expo Go is insufficient. See [development setup](docs/development.md) and [releasing](docs/releasing.md) for build and OTA instructions.

[MIT license](LICENSE) · Support: [scide.business@gmail.com](mailto:scide.business@gmail.com)
