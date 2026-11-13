# Compact layout, live theme and picture fallbacks (November 2026)

Verification notes for three changes on top of 6d14bb4. Measured on the Android emulator (Pixel profile, debug
build through Metro), not on a real phone or a release build.

## 1. Compact layout

### Where the size came from

The emulator panel is 1080 × 2400 px at 420 dpi: 411 × 914 dp, font scale 1.0. All sizes in the app are dp
(React Native's unit); px only appear in screenshots (× 2.625 here). Content column before: 411 − 2 × 20 = 371 dp.

Measured on the 6d14bb4 build:

- Type: the reference's iOS point sizes were used 1:1 (body 17, large title 34, section headers 20). Android's
  Roboto at the same dp reads larger than SF Pro, so every line was a size step bigger than a native Android app.
- Rigid heights: rows min 52 dp, label-above-value detail fields 68 dp, library rows about 100 dp (four lines: name,
  store, badge, date).
- Stacking: the store, the badge and the end date each had their own line; every detail field put the label above
  the value; View/Save stacked below 360 text-adjusted dp; form labels sat above every field.
- Spacing itself was moderate (20 dp margins, 28 dp above section headers).

Home showed 6 warranties per screen; after the change it shows about 10 at 411 dp.

### What changed

The values are listed in docs/visual-reference.md ("Compact density"). Colours, materials, radii proportions,
weights, tracking and optical alignment are unchanged. One rule decides every beside-or-below choice: `useRoom()`
in src/theme.ts, the content column divided by the font scale. Thresholds: detail fields side by side from 260,
action pairs from 240, form labels beside the field from 300. Font scaling stays on; nothing is scaled with
transforms or forced onto one line. Names and descriptions keep their line counts (list names two lines, notes and
setting descriptions in full).

## 2. Live theme

The palette (`colors`, `TONE`) is one object updated in place by a small store (src/themeStore.ts, tested in
Node). `useTheme()` subscribes with `useSyncExternalStore`; every StyleSheet is built by `themed()`, which rebuilds
it once per theme change. The root layout re-renders the navigation theme, the status bar style and the system root
background (`expo-system-ui`). Choosing Light, Dark or Auto in Settings applies at once: no reload, no restart, and
a downloaded update is not activated by it (restart-into-update stays a separate path, used by Delete all).

Triggers: `Appearance` change events and a re-check whenever the app becomes active (covers a system change made
while Warrantly was in the background). Light and Dark override the system; Auto follows it.

Checked on the emulator, with the app lock on:

| Setting | System | Result |
|---|---|---|
| Dark | light | dark |
| Light | dark | light |
| Auto | dark | dark |
| Auto | light | light |
| Auto | switched to dark while in the background | dark on return, Settings still open |

- Settings stays at the same scroll position after each choice; the bar, tab bar, sheets and inputs change colour.
- Text typed into the Add form survived 5 system flips while the form was open.
- No lock prompt on resume within 3 minutes, no JS error, no black or white frame in the screenshots.
- Fixed on the way: form inputs kept the light colour in dark mode (their style was built once at start).

The black screen from the earlier report (docs/pin-scroll-pictures.md) was not reproduced in this round. The theme
mismatch found during that investigation can no longer happen, but that does not prove the black screen is fixed.

## 3. Picture fallbacks

Order: the user's photo if its file exists and loads; else the found picture if it belongs to the current name and
loads; else the category icon (list) or the camera tile (detail). A picture that fails to decode (`onError`) is
skipped for that row; the failure list resets when the row's picture paths change, so a new photo is tried again and
nothing retries in a loop. The credit shows only when the found picture is the one shown.

Checked on the emulator with planted files:

| Case | Shown |
|---|---|
| User photo valid | the photo |
| User photo file missing, found picture valid | the found picture, with credit |
| User photo corrupt, found picture valid | the found picture after the failed load, with credit |
| Only a corrupt user photo | category icon in the list, camera tile on the detail |
| Found picture for an old name | category icon |

## 4. Screenshots

A Maestro tour (library, filter sheet, detail, detail fields, document viewer, photo dialog, Add form, Settings,
Appearance, PIN) at three widths (set with `wm density` on the 1080 px panel), both languages, both themes and
three text sizes. "Room" is the content column divided by the font scale, the number `useRoom()` compares.

| Run | Width | Text | Theme | Language | Room | Result |
|---|---|---|---|---|---|---|
| en360b | 360 | 100 % | light | EN | 328 | all fields one line; View/Save, Save/Share, Scan/Photo side by side; segment icons shown |
| en360L | 360 | 160 % | light | EN | 205 | labels above values, pairs stacked, rows: badge below name, store cut to one line, date kept |
| en390D | 390 | 160 % | dark | EN | 224 | as above; dark palette on every screen, no light leftovers |
| en430 | 430 | 130 % | light | EN | 306 | fields and form labels side by side, pairs side by side |
| hu360D2 | 360 | 130 % | dark | HU | 252 | labels above values; pairs stacked (Hungarian words too long beside each other); segment icons dropped; dialog buttons in full rows |
| hu390 | 390 | 100 % | light | HU | 358 | everything side by side, as in English |
| hu430D2 | 430 | 160 % | dark | HU | 249 | as hu360D2 |

Found and fixed during the matrix:

- At 160 % the library row's meta line cut off the end date. Store and date are now separate: a long store is
  cut to one line and the date moves below it.
- Hungarian words broke in the middle where controls share a line ("Megnéze|m", "Beolvasá|s", "Világo|s",
  "galéri|ából"). `wordWidth()` in src/theme.ts estimates the longest word; button pairs stack, the segmented
  control drops its icons and dialog buttons take their own row before a word would break.

Not checked: a real phone, a release build, TalkBack, tablets and landscape.

## 5. Checks

`node --test` 109/109, `tsc --noEmit` clean, `expo lint` only the existing i18n warning, `git diff --check` clean.

## 6. Smooth theme transition follow-up

Shared text, cards, controls, inputs and glyphs now transition their colours over 220 ms on the UI thread.
`src/components/themeMotion.tsx` keeps this policy in one place. Layout, scrolling and press transforms are
excluded. The preference listener also responds to Reduce Motion changes while the app is open; reduced motion
uses zero duration. Press colours apply immediately while a control is held.

The navigation scroll edge crossfades two fixed gradients, avoiding an abrupt gradient-string replacement.
Existing core Animated scroll/press hosts stay native hosts: wrapping them in Reanimated disconnects native
scroll opacity updates on Android. The tab icon's native press scale also has its own view, separate from the
JS-driven compact geometry; sharing that transform graph produced unsupported native width/left warnings.

Reanimated 4.7.1 and Worklets 0.13.1 were already in the lockfile and Android autolinking/build. They are now
explicit dependencies at the same versions. No native module or runtime-version change is needed for this OTA.

Verification: 109 unit tests, typecheck, lint (existing i18n warning only); Android emulator theme cycling and
an Auto change under an unsaved Add form, plus library/filter/detail/document/dialog/form/Settings tour.
A screen recording confirms intermediate colours rather than a hard cut. These checks use a debug build,
not a physical device or an iOS build. The reusable Maestro checks are `.maestro/theme-transition.yaml`
and `.maestro/theme-draft.yaml`; pass `-e N=<screenshot-prefix>`, flip the emulator system scheme between them,
and use synthetic app data (lock disabled or the test PIN 1234).
The final cycle also passed at 360 dp width and 140% text, followed by an Auto change with Android animations
disabled; the draft and scroll position survived, with no React Native or Android runtime errors in logcat.
