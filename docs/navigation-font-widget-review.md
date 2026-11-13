# Settings, system navigation and widget polish — 13 November 2026

- Tap the profile card/pencil in Settings to edit the locally stored name. Save trims whitespace and
  refuses an empty value; Cancel preserves the old value. The 30-character limit matches onboarding.
  The profile refreshes on focus, including after a backup restore. Existing backup/name storage is reused.
- The floating bottom tabs previously subtracted 13dp from the system inset. On a three-button Android
  navigation bar this placed controls inside the system bar. They now sit 8dp above the full bottom inset.
- PIN key sizing uses the available safe height. Short screens and large text omit decorative branding
  and align content from the top, so overflow remains scrollable. The last keypad row and footer have
  safe bottom padding. Setup's Continue action remains reachable by scrolling at extreme text sizes.
- Onboarding scrolls when text, display scaling or the keyboard leave too little vertical space.
- Summary controls switch to a vertical column at constrained text-adjusted widths, preserving whole
  translated labels. Status-card actions move below their labels when needed; Settings text can shrink
  within its row rather than overflow fixed trailing controls.
- Widgets budget space for header, row text, count, photos and optional actions before choosing row count.
  Narrow/large-font widgets hide actions that cannot fit; the smallest widgets prioritize the countdown.
  Counters use compact, single-line translated labels with full accessibility descriptions. The attention
  badge uses a count. Personal photos, privacy settings, app theme and deep links are retained.

## Verification

- Disposable Android API 37 emulator with the system three-button navigation overlay enabled. At 320dp
  width and 2x font size the bottom tab targets end at y=1763, above the system navigation area at y=1794.
- Created and confirmed a PIN with large text, then cold-started the app. The unlock screen's zero key and
  Forgot PIN control fit above system navigation; setup's Continue action can be fully scrolled into view.
- Renamed the test profile to TravelReviewer; the new name remained after a cold restart.
- Hungarian, 320dp width, 2x text: all three summary labels were single lines with no word splitting.
- Native WidgetPreview renders at 180x80, 250x150 and 300x300dp, normal and 2x text, visually inspected.
- 142 unit tests passed, including new widget space-budget and localized-action tests. Typecheck passed;
  lint has zero errors and one existing i18next warning. Temporary preview route removed before release.

Samsung S21 FE hardware was not available; the reported navigation mode, narrow layout and enlarged font
conditions were exercised on the emulator. These are JavaScript/layout changes for runtime 0.9.0.
