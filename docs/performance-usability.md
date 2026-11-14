# Performance and everyday usability

The home screen keeps Add and Settings visible while scrolling. Scrolling no longer
calls a JavaScript listener to collapse the navigation bar or animates its layout.
The existing native scroll-driven title fade and press feedback remain.

Search uses a deferred result query so input has priority. Grouping, totals, section
data and filter facets are memoized. Warranty rows use React.memo with stable styles;
sync progress and typing do not re-render unchanged rows. Grouping no longer tests
every active warranty against an array of soon-expiring warranties. Filter counts use
one pass over the library instead of two full scans for each choice. ISO calendar
comparison avoids Date allocations when only active/expired status is needed.

No-results searches offer one button to clear both search and filters. An empty
library offers manual Add as well as Gmail. Search disables autocorrection and
capitalization, dismisses the keyboard on submit/drag, and searches expired records.
Selecting a filter returns to the top so the result and selected filter are visible.

Home reads independent data together and ignores outdated photo/load completions.
Sync indicates work immediately and always releases its retry guard on failure.
Detail loads documents and history together, without waiting for related covers.
Missing/failed detail loads have an explanation and recovery actions instead of a
blank screen; updates stop when the screen loses focus.

## Verification

- Typecheck, lint (one existing i18next import warning), 115 passing unit tests.
- Android API 37 emulator with 14 synthetic warranties: scrolling with persistent
  navigation; one-tap Settings and Add; no-results reset; store selection/counts and
  clear; search to detail to PDF, actual two-pointer pinch out/in; invalid warranty
  link with a working return to the library.
- Short 360dp-wide display with 1.4 font scale and dark mode: Add/Settings and the
  Add form's Save action remain available. Restored emulator display/font/theme.
- No ReactNativeJS errors or AndroidRuntime crashes during the checks.
- Desktop Node calculation benchmark, 10,000 synthetic warranties and 100 stores:
  old filter counts 910.94ms versus new facets 0.86ms, with identical counts.
  This is a calculation benchmark, not device FPS or an app startup measurement.

Physical-device release performance, iOS, and screen-reader interaction were not
measured. No native dependency or runtime change is required for these changes.
