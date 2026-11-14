# iPhone release and GitHub downloads

## Recommended route

Keep GitHub as the public project/download page. Add an **Install for iPhone** button that opens a TestFlight public invitation first, then an App Store link when the app is ready for a permanent public release.

A GitHub-hosted `.ipa` is not a universal tap-to-install download like an Android APK. Apple requires appropriate signing and an allowed installation/distribution method. An ad hoc IPA is restricted to registered devices; uploading it to GitHub does not remove that restriction. See [Apple distribution methods](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/) and [registered-device distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices/).

Apple's [Developer Program](https://developer.apple.com/programs/) lists a US$99 annual membership (local pricing/taxes may differ). [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/) supports up to 10,000 external testers; builds expire after 90 days, and external distribution requires beta review. It is a beta route, not a permanent substitute for an App Store release.

## Actual work needed in this repository

The React Native screens, TypeScript parsing, SQLite data, translations and most shared UI can be reused. This repository is currently an Android app with an iOS bundle identifier, not a verified iOS build:

1. Port `modules/pdf-pages` to iOS (PDFKit/Core Graphics or an equivalent tested implementation). Its native module config currently lists only Android; PDF viewing, OCR input and private copies rely on it.
2. Replace/port `modules/google-account-token` for iOS and configure a Google iOS OAuth client and URL scheme. `src/google.ts` currently uses Android account-token and Play Services paths. Keep Gmail access off until its separate Google review is approved.
3. Split Android widget startup and imports out of `index.ts`, `src/widget.tsx` and the configuration screen. Add a WidgetKit extension for an iPhone widget, or initially ship with widget UI hidden accurately on iOS.
4. Enable and test an iOS share extension. The current share-intent plugin explicitly sets `disableIOS: true`.
5. Configure and test camera/photo usage descriptions, Face ID, document pickers, notifications, scanner, Drive backup/restore, safe areas, keyboard handling and private PDF exports on real iPhones. Android testing does not establish iOS compatibility.
6. Add a store-distribution EAS build profile for iOS, separate from the existing Android internal `preview` profile. Set an appropriate update channel and keep `EXPO_PUBLIC_GMAIL_IMPORT=0`.
7. Enroll in the Developer Program, create the App Store Connect app, supply signing credentials, then build and submit with Expo's cloud service. A local Mac is not required for the cloud build; real iPhone testing is still necessary.

After the port and store profile exist, the CLI flow is:

```sh
npx eas-cli@latest build --platform ios --profile ios-store
npx eas-cli@latest submit --platform ios --latest
```

These are future commands; the `ios-store` profile and working iOS implementations are not created by the Android import feature change. See [Expo build setup](https://docs.expo.dev/build/setup/) and [submission](https://docs.expo.dev/deploy/submit-to-app-stores/).

## Other routes

- **Small private test:** ad hoc signing for registered iPhones. It is less convenient than a public TestFlight link for friends.
- **Direct website installation in the EU:** Apple's [Web Distribution](https://developer.apple.com/support/web-distribution-eu/) requires authorization, notarization, a registered developer-owned domain and specific eligibility. A normal GitHub Release download is not this mechanism.
- **GitHub IPA for advanced sideloaders:** users must arrange a compatible signing/sideloading setup; availability and renewal requirements depend on that setup. Do not present it as a frictionless public install.
- **No Apple membership:** a separate web/PWA edition could be hosted and installed from Safari, but needs its own storage, backup, document and platform feature work. The existing native app is not automatically a complete PWA.

No Apple enrollment, paid purchase, iOS build or App Store submission was performed during this task.
