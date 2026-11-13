# UI finishing pass — November 13, 2026

Branch: `codex/finish-warranty-ui`, based on `0cf253c`. Started by Codex, finished by Claude. Runtime/app version stays 0.8.1; no OTA update was published.

## Changes

- Keep the existing grouped library, bottom navigation, and documents near the top of each warranty.
- Bottom navigation adapts to large system text: when the screen is narrower than about 300dp of text-scaled width (for example 360dp at 160% text), Warranties, Add and Settings become three full-width icon-and-label rows (each at least 48dp tall) instead of breaking "Hozzáadás" mid-word. The normal bar is unchanged; its Add button can now grow past 104dp for longer labels. Font scaling stays on and no label is hidden or clipped.
- Make ordinary covered rows quieter, reserving urgent colors for items that need attention.
- Keep Close reachable in long filter/action sheets, including large text and long titles.
- Give document buttons enough width and padding; stack them on narrow screens with enlarged text. Bound PDF page width to the app's tablet content width.
- Prevent overlapping scan/save/share requests and show progress. Preserve a form's document on failure, clean up abandoned capture results, and save a new warranty plus its attachment transactionally.
- Save a separate PDF copy on repeated exports; remove only a newly created partial file if writing fails. Cancellation remains quiet.
- Add English and Hungarian feedback for save/share failures.
- Maestro: `ui-polish-large.yaml` scrolls to the real Hungarian delete label `Törlés`; `save-folder.yaml` handles both the older (`Show roots` → `Downloads`) and newer (internal storage → `Download`) Android folder pickers.

## Automated checks (final run, after the navigation change)

- `npm test`: 86 tests, 86 pass, 0 fail.
- `npm run typecheck`: no errors.
- `npm run lint`: 0 errors, 1 warning — the existing `import/no-named-as-default-member` at `src/i18n/index.ts:24`.
- `git diff --check`: clean.
- Earlier in the pass (not rerun): a mutation check where removing the save overlap guard made three lifecycle tests fail, and a successful Android debug APK build. Windows testing used a short temporary checkout and a temporary CMake object-path limit; neither workaround is in Git.

## Native Android (final run)

Disposable API 37 emulator, this checkout's Metro bundle (host port 8097 via `adb reverse`, not the other checkout's server on 8081), synthetic data only.

- `ui-polish.yaml` — **passed** (1m 59s) at the emulator's default 411dp width, 100% text. Onboarding, add "Review kettle", import a PDF, save, open the viewer and wait for `Page 1 of 1`, cancel the save picker (no message shown), export from the detail screen, export again from the viewer. The first attempt was blocked by an emulator "System UI isn't responding" dialog over the welcome screen; after dismissing it the complete flow passed uninterrupted.
- Export check: `/sdcard/Download/WarrantlyExports` started empty and ended with exactly `Review kettle.pdf` and `Review kettle (1).pdf`, both 609 bytes and byte-identical to the imported fixture.
- `ui-polish-large.yaml` — **passed** (56s) at 360dp (720×1600 @ 320dpi) with `font_scale=1.6`, Hungarian: home, filter sheet, documents, viewer with rendered page and both buttons, More sheet scrolled to `Törlés` with `Bezárás` still visible.
- An extra local flow captured English and Hungarian home screens at 360dp at both 100% and 160% text, plus the English filter sheet; all steps completed. Dark theme was checked at 360dp at both text sizes (cold relaunch, since the theme is read at startup).

Screenshots inspected (paths relative to the workspace; `.expo/` is ignored by Git), all in `.expo/ui-review/final/screens/`:

- `polish-large-hu-home.png`, `large-hu-home.png`, `large-en-home.png` — stacked navigation at 160%; the list keeps about two thirds of the screen.
- `normal-en-home.png`, `normal-hu-home.png` — unchanged bar at 100%.
- `dark-large-en-home.png`, `dark-normal-en-home.png` — dark theme, both layouts.
- `polish-pdf-viewer.png`, `polish-large-hu-viewer.png` — the PDF page itself renders ("Warrantly test receipt - 24 months"), not just the zoom label.
- `polish-documents.png`, `polish-large-hu-documents.png`, `polish-pdf-saved.png`, `polish-attached-form.png`.
- `polish-large-hu-filter.png`, `large-en-filter.png`, `normal-en-filter.png`, `polish-large-hu-more.png`, `polish-large-hu-more-scrolled.png` — sheets with Close reachable.

The exported copies are in `.expo/ui-review/final/exported/`.

`.maestro/run.sh` runs both flows, compares the exported bytes, and restores font/display settings before the existing regression flows. GitHub's device workflow runs them on API 34; that CI run was not triggered in this pass.

## Limits

Not verified: a physical phone, iOS, Google account sign-in, Gmail sync, Drive backup, the widget, camera OCR, and TalkBack. The single-warranty filter sheet is short; long-sheet scrolling was verified on the More sheet at 160% and in the earlier browser preview with a long store list. The existing native PDF renderer is unchanged.
