# UI clarity and date picker review

14 November 2026

- Custom warranty input shows “Custom” / “Egyéni” when a preset is active. Typed amounts remain editable; presets restore their selected state.
- Purchase, warranty-start and custom-reminder dates share the app's floating, themed calendar. Month/year grids make older dates quick to reach. Cancel discards the draft; Done applies it. Reminder dates start tomorrow using local calendar arithmetic.
- Calendar uses explicit seven-cell week rows, avoiding Android fractional-width wrapping. Its action buttons stay outside the scrolling calendar and above the navigation area.
- English/Hungarian descriptions are shorter across onboarding, forms, settings, backup, sharing and help. Restore/password/privacy warnings retain their important meaning.
- Shared action pairs measure entire labels. Long field labels use the full width when needed. At large text sizes, warranty counters no longer squeeze product names into a narrow strip.
- README now gives the stable APK installation steps, beta migration, OTA behavior and a short technology summary. Development/release instructions distinguish Metro, signed APKs and OTA updates. OTA release records cannot replace the stable APK as Latest.

Validation: 151 Node tests pass; TypeScript passes; lint has no errors and one pre-existing i18next import warning. Android emulator checks cover translated custom input, custom 60 months and preset reset, date confirmation/cancellation, year/month selection and leap day, English/light and Hungarian/dark themes, 320dp width with font scale 1.6, and three-button navigation. No native dependency or runtime change is required.


Published and verified:

- App commit: `8dbb919d6ec6d392eefc0f0fa35d182be2925080`.
- Android runtime: `1.0.0`; update channel/branch: `preview`.
- OTA group: `4b391ef1-2a2c-4fed-be7a-2094e1e9af57`.
- Android update ID: `01a1d906-ce26-7052-97e5-60819b3acf70`.
- GitHub record: [v1.0.0-ota.1](https://github.com/ScideCodes/Warrantly/releases/tag/v1.0.0-ota.1). Stable `v1.0.0` remains Latest with its APK.
- The signed 1.0.0 APK displayed the update-ready banner. Restarting applied the OTA; the translated custom placeholder and themed calendar were checked in the installed release app. No new runtime errors appeared in the checked log.
- Additional emulator checks confirmed 60 months survived save/reopen and that custom reminder dates disable today while enabling tomorrow. Gmail import remains disabled in the public update.
