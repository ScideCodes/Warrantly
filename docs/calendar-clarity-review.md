# UI clarity and date picker review

14 November 2026

- Custom warranty input shows “Custom” / “Egyéni” when a preset is active. Typed amounts remain editable; presets restore their selected state.
- Purchase, warranty-start and custom-reminder dates share the app's floating, themed calendar. Month/year grids make older dates quick to reach. Cancel discards the draft; Done applies it. Reminder dates start tomorrow using local calendar arithmetic.
- Calendar uses explicit seven-cell week rows, avoiding Android fractional-width wrapping. Its action buttons stay outside the scrolling calendar and above the navigation area.
- English/Hungarian descriptions are shorter across onboarding, forms, settings, backup, sharing and help. Restore/password/privacy warnings retain their important meaning.
- Shared action pairs measure entire labels. Long field labels use the full width when needed. At large text sizes, warranty counters no longer squeeze product names into a narrow strip.
- README now gives the stable APK installation steps, beta migration, OTA behavior and a short technology summary. Development/release instructions distinguish Metro, signed APKs and OTA updates. OTA release records cannot replace the stable APK as Latest.

Validation: 151 Node tests pass; TypeScript passes; lint has no errors and one pre-existing i18next import warning. Android emulator checks cover translated custom input, custom 60 months and preset reset, date confirmation/cancellation, year/month selection and leap day, English/light and Hungarian/dark themes, 320dp width with font scale 1.6, and three-button navigation. No native dependency or runtime change is required.
