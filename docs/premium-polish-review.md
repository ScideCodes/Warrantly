# Premium UI polish review

## Direction

Preserve the pinned iOS27 visual reference while making Warrantly feel like a focused warranty archive: quiet controls, aligned dates and counts, readable choices, and documents as the main content.

Applied the installed Impeccable and Unslop skills. Unslop is by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), licensed CC BY 4.0. No skill source is bundled with the app.

## Changes

- Compact library filters replace oversized summary numbers. Missing documents use neutral emphasis.
- Shared empty states, consistent icon columns, tabular expiry figures and clearer checkbox/PIN contrast.
- Detail toolbar keeps Edit and More; pinning remains available inside More.
- Reminder time now uses a themed, localized hour/minute sheet with explicit Done and cancellation.
- Calendar month and year share a row when space permits.
- Sheets and page content use a consistent maximum width on tablets.
- Large-text settings switches move below their labels; duplicate comparisons stack when needed.
- Fixed collection sheets and onboarding/form actions being obscured by the software keyboard, including Android three-button navigation.
- Backup and transfer screens show loading/failure states rather than blank pages. Backup save/retry always clears busy state.
- Shorter English/Hungarian onboarding and help copy. Public help accurately describes paused Gmail access; the Gmail feature flag remains off.

## Verification

- Reviewed all 23 route sources and shared UI/widget components. Emulator screenshots cover library, settings, calendar/time sheets, collections, documents, inbox, duplicates, help, backup, restore, privacy, release notes, PIN, attention, ignored items, serial scan, onboarding and warranty edit.
- Checked normal phone layouts, dark Hungarian layouts at 320dp with 1.6 font scale, and a wider tablet viewport. Long descriptions may wrap naturally; controls and short labels retain usable space.
- Interacted with the clock wheels: cancellation preserves the old value; Done persists the new value.
- Confirmed collection editor, onboarding Continue, backup password action and warranty Save stay above the software keyboard.
- Typecheck passes. Lint has zero errors and one pre-existing i18next import warning. All 151 tests pass. Diff whitespace check passes.
- Impeccable detector reported 44 findings, all in commercial-email HTML parser fixtures; none in app UI files. That detector is primarily HTML-oriented, so native screenshots and interaction checks provide the visual evidence.
- Maestro onboarding selectors were updated for the revised copy; the full Maestro suite was not rerun. Camera, destructive actions and real network/backup flows were not exhaustively retested in this visual pass.

Release verification is recorded below after publication.
