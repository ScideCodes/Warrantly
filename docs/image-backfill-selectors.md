# Existing warranty pictures and readable selectors

> **Removed on 13 Nov 2026.** Warrantly no longer looks pictures up online: the Settings switch, the background
> lookups, "Find a picture online" and the picture credit are gone, and nothing is sent to Wikimedia. Only the
> person's own photo (camera or gallery) is kept. Phones that held found pictures delete them once on the next
> list load (`src/legacyPictures.ts`). The selector part below still applies; the picture part is history.


Enabling Product pictures now immediately starts one shared background pass over all
eligible existing warranties, replacing the former six-item limit. Returning to Home
joins that pass rather than starting a duplicate. Each successful picture refreshes
its row while the rest of the library continues processing. User photos, explicitly
removed pictures and cached no-match results keep their existing rules. Exact model
matching and attribution are unchanged; unmatched products retain category icons.

Lookups remain serial and rate limited. Switching the setting off stops subsequent
items. A network interruption retains successes; unfinished items are retried on a
later list load. Updated EN/HU help text explains existing-library coverage.

The shared segmented selector reserves space for complete labels at the current
font scale. When a row cannot fit, whole options reflow into balanced rows (four
backup frequencies become 2x2), then one column at larger text sizes. Labels stay
single-line, with their full accessible names. This applies to backup frequency,
appearance and language, without shrinking text or breaking Monthly/Havonta apart.

Validation: 120 unit tests, typecheck, lint (existing i18next import warning only),
and Android API 37 emulator checks. Backup frequency was selected in EN and HU,
including HU at 1.4 font scale. Appearance and language were selected at 360dp width
and 2x text in light/dark themes, preserving Settings. Automatic-picture toggle was
checked; deterministic queue tests cover a 19-item existing library, per-item updates,
disable during a pass and partial offline failure. These tests do not guarantee a
Wikimedia match for every product. No new native dependency/runtime is required.
