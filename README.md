<div align="center">

<img src="docs/media/hero.png" alt="Warrantly: every warranty in one place, days left counted for you" width="100%" />

# Warrantly

**Every warranty in one place. Private by design.**

An Android app that finds your purchase and warranty emails, keeps the receipts with each purchase and counts the days left.

![Version](https://img.shields.io/badge/version-0.8.1-007aff)
![Android](https://img.shields.io/badge/Android-app-3ddc84?logo=android&logoColor=white)
![Expo SDK 58](https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white)
![Tests](https://img.shields.io/badge/tests-93%20passing-2ea44f)
![Languages](https://img.shields.io/badge/languages-English%20%7C%20Hungarian-8e8e93)

[Screenshots](#screenshots) · [Features](#features) · [Privacy](#privacy) · [Install](#install) · [Design](#design) · [Under the hood](#under-the-hood) · [Docs](#docs)

</div>

---

Warrantly reads the purchase mails already in your Gmail, picks out the ones with a warranty, and keeps everything on your phone: the product, the store, the dates, the PDF. Open the app and see what is still covered, what ends soon and what has expired. No account, no server, no ads, no tracking.

---

## Screenshots

<table>
  <tr>
    <td width="25%" valign="top"><img src="docs/screenshots/library.png" alt="Library grouped by status with days-left badges" width="100%" /><br /><b>Library</b><br />Grouped by status, with a plain days-left badge.</td>
    <td width="25%" valign="top"><img src="docs/screenshots/detail.png" alt="Warranty detail with the documents first" width="100%" /><br /><b>Documents first</b><br />The receipt and PDFs open in one tap.</td>
    <td width="25%" valign="top"><img src="docs/screenshots/filter.png" alt="Filter by store" width="100%" /><br /><b>Filter</b><br />By store, status or search.</td>
    <td width="25%" valign="top"><img src="docs/screenshots/edit.png" alt="Add or edit a warranty" width="100%" /><br /><b>Add or edit</b><br />Large fields, one Save button.</td>
  </tr>
  <tr>
    <td width="25%" valign="top"><img src="docs/screenshots/settings.png" alt="Settings with reminders, backup and language" width="100%" /><br /><b>Settings</b><br />Reminders, backup, lock, language.</td>
    <td width="25%" valign="top"><img src="docs/screenshots/dialog.png" alt="Confirmation dialog for deleting all data" width="100%" /><br /><b>Clear confirmations</b><br />Destructive actions say what they do.</td>
    <td colspan="2"></td>
  </tr>
</table>

<sub>Screens show synthetic demo data.</sub>

---

## Features

| | What Warrantly provides |
| --- | --- |
| 📧 **Finds warranties for you** | Reads Gmail (read-only, several accounts) and picks out purchase mails and warranty documents. |
| ⏳ **Days left at a glance** | Covered, ending soon and expired, with a plain badge. Filter by store, search, ignore what does not matter. |
| 📄 **Documents first** | Mail PDFs, photos and scans open inside the app. Scan a paper receipt with on-device text recognition. |
| 🔔 **Reminders** | Before a warranty ends and for the return window of online orders. You choose when. |
| 🛠 **History and claims** | Repairs, notes, price and category, several warranties per purchase (standard, extended), a shortcut to the store's support. |
| 🔒 **Private by design** | Optional PIN and biometric lock, encrypted backup to your own Google Drive, export to PDF, CSV or JSON, delete everything in one tap. |
| 🌍 **Made for everyone** | English and Hungarian, light and dark, large-text friendly, a home-screen widget and app shortcuts. |

---

## Privacy

Warrantly has no server and no account. Your warranties live in a database on the phone. Gmail access is read-only, only warranty-related mails are downloaded, and only the details a warranty needs are kept. Backups are encrypted on the phone (scrypt and AES-256-GCM) before they reach your Drive. Read the full [privacy policy](docs/privacy.md).

---

## Install

The app uses native modules, so Expo Go cannot run it. Build a test APK in the cloud and install it:

```sh
npm install
npx eas-cli@latest build --platform android --profile preview
```

JavaScript-only changes reach an installed build over the air with `npx eas-cli@latest update --channel preview`. A change that adds native code needs a new `version` in `app.json` and a new build.

---

## Design

The interface follows the bencepc.hu iOS 27 design system, rebuilt natively in React Native: grouped cards, large titles, a floating tab bar that minimizes while you scroll, floating sheets and glass buttons. Measured values, what the reference does not define and the platform limits are written down in [docs/visual-reference.md](docs/visual-reference.md).

---

## Under the hood

| | |
| --- | --- |
| **App** | Expo SDK 58, React Native 0.88, Expo Router, TypeScript, on-device SQLite |
| **Native** | Two small local Expo modules in Kotlin: Gmail account tokens (`modules/google-account-token`) and PDF page rendering (`modules/pdf-pages`) |
| **Logic** | Email parser, Gmail adapter, backup format and database logic are plain TypeScript, tested in Node |
| **Checks** | 93 unit tests, strict typecheck, lint; Maestro flows drive the app on an Android emulator in GitHub Actions |

```sh
npm test            # parser, Gmail adapter, database, backup, translation key parity
npm run typecheck
npx expo lint
```

---

## Docs

[Privacy policy](docs/privacy.md) · [Visual reference](docs/visual-reference.md) · [UI polish notes](docs/ui-polish.md) · [Development notes](docs/development.md) · [Original plan](docs/brainstorm.md)
