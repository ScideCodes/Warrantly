# Multiple serial numbers

Uses Impeccable and the code-review skill, retaining the pinned iOS27 materials, type and shared controls in `visual-reference.md`.

- Open a warranty, Edit, then Serial numbers under More details. Each number has an optional unit label, its own scanner and remove action. Add another for an indoor/outdoor AC unit or other components. English and Hungarian are included.
- Up to 20 components. A label without a number is flagged instead of silently discarded. Blank unlabeled rows are optional.
- Schema 14 adds labeled serials while keeping existing serials intact. The first number also remains in the old scalar field. Backups and Warrantly transfers preserve every component; old backups and shared files still work.
- Details, search, completeness, duplicate matching/merging, claim emails and CSV/PDF summaries use all components. Leaving serials out of an ownership transfer removes both storage fields.
- Regression checks: 172 tests pass; typecheck passes; lint has zero errors and the existing i18next warning. Tests cover migration from 13, save/edit/remove, scalar callers, old/new backups, old/new sharing, transfer privacy, summaries, secondary-serial duplicate matching and lossless merge.

## Device review

- Android developer emulator, Hungarian dark theme: entered two labeled serials, used the second row's scanner/manual-confirm path and verified the first number stayed unchanged; saved and reopened both edit and detail screens.
- At 320dp / 160% font scale, inputs remain full width and scan/remove buttons move below them. Inspected the rendered form and detail layout for alignment and clipping.
- Removed the first component, saved and reopened: the outdoor serial stayed intact and became primary.
- Only synthetic warranties were used. Barcode-camera recognition itself was not retested; the existing scanner's confirmation and row-targeted return were tested. No new native dependencies or permissions.

## Release

- Main feature commit: `e71a89c`, pushed to the working and default branches.
- Initial feature OTA: `v1.0.0-ota.5`, group `77c532e5-e12c-4745-b1a6-d92c325f48b6`. Verified the update card, Restart now, and adding a second serial field on the signed stable APK. Settings reported `update 01a1d9bf`.
- That English light-theme review also exposed an existing Currency label squeezed into the 96dp column. Price and currency now keep their labels above their inputs; at narrow widths/large fonts the pair stacks vertically. The shared iOS27 field styling is unchanged. Typecheck, lint and all 172 tests pass after this correction.
