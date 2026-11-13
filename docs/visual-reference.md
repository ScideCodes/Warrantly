# Visual reference: bencepc.hu "iOS 27" style

Warrantly's look is taken from the bencepc.hu design system. This file records where every value comes from, so a
later change can be checked against the source instead of memory.

Since November 2026 the owner's preference is a **compact** phone layout: Warrantly keeps the reference's colours,
materials, shapes, type hierarchy and optical alignment, but not every size 1:1. The departures are listed in
"Compact density" below; everything else still matches the measured values.

## Source and deployed version

- Repository: `ScideCodes/BencePC`, branch `main` at `551a366` (matches `origin/main`, fetched 13 Nov 2026).
- Live pages (`/`, `public.html`, `arak.html`, `admin.html`) load exactly two style sheets: `/assets/site.css?v=4`
  and `/assets/ios.css?v=66`. `ios.css` is the design system; `site.css` is the base reset under it.
- Deployed = source: the live `ios.css`, `site.css` and `icons.svg?v=8` are byte-identical to the checkout after
  normalising line endings (checked with `cmp`, 13 Nov 2026). `chrome.js` (sheet and tab-bar behaviour) is owner-only
  and answers 404 to visitors, so the checkout is the only readable copy of it.
- The site's own reference contract: `docs/ios27-fidelity-implementation.md` in that repository. It records which
  values come from Apple's iOS/iPadOS 27 Figma kit 27.1.4 (`[ref]` in `ios.css`) and which the site adapted.
- Not used: `assets/style.css` (Onest and Sometype fonts) is loaded only by `/lab/` experiments, not by live pages.
  `app-ui.css` and `liquid-ui.css` are kept on disk "for reference" and are not loaded.

All line numbers below refer to `public/assets/ios.css` at `551a366`.

## Measured values

`rem` is 16 px. On a phone a CSS pixel equals one Android dp, so the values carry over 1:1. Letter spacing is given
in `em` in CSS. React Native takes points, so Warrantly multiplies by the font size (for example −0.0255 em × 17 =
−0.43).

### Colour (lines 13–32 light, 57–79 dark; dark overrides at 1058–1066)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #f2f2f7 | #000 | page |
| `--card` | #fff | #1c1c1e | grouped cards |
| `--card-2` | #f2f2f7 | #2c2c2e | text fields inside cards |
| `--ink` | #000 | #fff | labels |
| `--ink-2` | #6c6c70 | #a1a1aa | secondary labels |
| `--ink-3` | #c5c5c7 | #73737b | chevrons (dark chevron #5a5a5e, line 266) |
| `--line` | #e6e6e6 | rgba(84,84,88,.65) | separators |
| `--fill` / `--fill-2` | rgba(120,120,128,.12 / .2) | .24 / .36 | control tracks, pressed fills |
| `--press` | #d1d1d6 | #3a3a3c | pressed row |
| `--select` | #ededed | rgba(255,255,255,.12) | tab lens, menu selection |
| `--tint` | #0088ff | #0091ff | glyphs |
| `--tint-ink` | #0058b9 | #409cff | tinted text |
| `--link` | #0066d6 | #64a8ff | links, text buttons |
| `--accent` / `--accent-down` | #0071e3 / #006edb | #0070e0 / #0062c7 | Glass Prominent button |
| `--tint-soft` | rgba(0,122,255,.12) | rgba(10,132,255,.2) | selected rows |
| `--ok` / `--ok-soft` | #1b7a33 / #e3f4e7 | #30d158 / #12321c | success |
| `--warn` / `--warn-soft` | #c93400 / #fff1e6 | #ff9f0a / #3a2a10 | warning |
| `--bad` / `--bad-soft` | #d70015 / #ffe9eb | #ff453a / #3d1a1a | error, destructive |
| `--switch-off` / `--switch-on` | #8a8a8e / #248a3d | rgba(235,235,245,.3) / #248a3d | switch track |
| `--seg-on` | #fff | #636366 | segmented selection |
| `--material-solid` | #f9f9f9 | #1c1c1e | glass without backdrop blur (lines 680, 690) |
| `--material` | rgba(249,249,249,.78) | rgba(30,30,30,.76) | toast, alert |
| `--glass-fill` | rgba(255,255,255,.58) | rgba(44,44,46,.68) | glass over a blur |
| `--sheet-bg` | #f2f2f7 | #1c1c1e (groups in a dark sheet #2c2c2e, line 80) | sheets |
| `--dim` | rgba(0,0,0,.35) | rgba(0,0,0,.42) | scrim |
| `--shadow` | 0 10 40 rgba(0,0,0,.14) | 0 8 28 rgba(0,0,0,.28) | sheets, toasts |

### Type (lines 9–10, 34–43, 121)

Font: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, …`. No web
font is loaded on live pages. On Android Chrome the stack resolves to **Roboto**, which is also React Native's default
on Android, so Warrantly keeps the system font and does not bundle one.

| Style | Weight size/line | Tracking | Token |
|---|---|---|---|
| Large Title | 700 34/41 | +0.011 em | `--t-large`, line 181 |
| Title 2 | 700 22/28 | +0.015 em | `--t-title2` |
| Title 3 | 600 20/25 | — | `--t-title3` |
| Section header (Prominent) | 600 20/25 | −0.022 em | `--t-sec`, line 244 |
| Headline | 600 17/22 | −0.0255 em | `--t-head` |
| Body | 400 17/22 | −0.0255 em | `--t-body`, body line 121 |
| Bar and sheet title | 600 15/20 | −0.015 em | `--t-bar` |
| Subhead | 400 15/20 | −0.015 em | `--t-sub` |
| Footnote | 400 13/18 | −0.005 em | `--t-foot` |
| Caption | 400 12/16 | — | `--t-cap` |
| Button | 500 17/22 | −0.0255 em | `.btn`, line 385 |
| Tab label | 600 10/12, stops growing at 13 px | 0 | `.tab`, line 196 |

### Geometry

| Item | Value | Source |
|---|---|---|
| Page margin | 16 below 375 px wide, 20 from 375 | `--gutter`, line 81 |
| Grouped card | radius 26, opaque `--card`, clips its rows | `--radius`, line 249 |
| Row | min 52 tall, 15 vertical / 16 side padding, gap 12; tall two-line row 68 | lines 51, 257, 299 |
| Separator | 1 px `--line`, inset 16 at both ends; 59 from the leading edge after a 29 px icon | lines 262, 270 |
| Icon tile | 29 × 29, radius 7, white 18 px glyph on a system colour | `.tile-icon`, line 135 |
| Chevron | 14 px, `--ink-3`, stroke 2.4 | line 265 |
| Section header | 28 above, 8 below, 4 side padding | line 245 |
| Large title block | 4 above, 8 below | line 179 |
| Navigation bar | 60 tall, glass buttons 44 round with 20 px glyphs (back chevron 22, stroke 2.2), compact title centred | lines 50, 153–160, 170–175 |
| Buttons | capsule, min 44, padding 11 × 20, radius 22 | `.btn`, line 385 |
| Text field | min 44, padding 9 × 12, radius 14, `--card-2`, focus ring 2 px `--tint` | lines 601, 605 |
| Search capsule | min 38, radius 999, `--fill`, 1 px `--line` border, 18 px glyph | `.side-search`, line 722 |
| Page search field | the standard text field on `--card` (dark, inside a sheet: #2c2c2e), no glyph | `input.quick-search`, lines 943, 1110–1111 |
| Switch | track 64 × 28 radius 14; knob 38 × 24 radius 12, 2 px in, travel 22, shadow 0 2 6 .12 + 0 1 1 .04 | lines 318–322 |
| Segmented (small) | track 32, padding 2, gap 4, radius 16, `--fill`; options 28 radius 14, 13.33/18 500 (600 selected) | lines 402–406 |
| Segmented (large) | track 50, options 46 radius 23 | `.seg-3`, lines 533–538 |
| Tab bar | min(368, width − 42) wide, 4 padding, radius 31, 54 tall tabs radius 28, 24 px glyphs; bottom max(10, safe area − 13) | lines 189–203 |
| Tab selection lens | `--select`, radius 28; selected glyph `--tint` stroke 2.1, label `--tint-ink` | lines 200–207 |
| Sheet (phone) | floats 6 from sides and bottom; corners 38 top, 58 bottom; grabber 60 × 4 (#ccc, dark #636366) 6 from the top; toolbar 54 with a 44 glass close button leading (18 px X, stroke 2.2) and a 15/20 semibold centred title; content padding 4 16 24 | lines 506–563, 1062 |
| Alert | width min(300, width − 32), padding 14, radius 34, `--material`; title Headline, message Footnote, centred; actions min 48, radius 24, gap 8; Cancel `--fill`/ink, primary `--accent`/white 600 17/22 | lines 567–580 |
| Toast | capsule radius 24, padding 10 × 18, `--material`, 0.5 px `--material-edge`, `--shadow`, 600 15/20 | lines 494–502 |

### Compact density (Warrantly's sizes, not the reference's)

Measured on the emulator before the change: 1080 × 2400 px at 420 dpi = 411 × 914 dp, font scale 1.0, a 371 dp
content column. The extra size came from the type ramp (iOS point sizes read about 6 % larger on Android at the same
dp: body 17, large title 34, section headers 20), rigid row heights (52 rows, 68 dp label-above-value fields, about
100 dp library rows) and stacking (store on its own line, every detail label above its value, actions stacked below
360 text-adjusted dp). Spacing itself was moderate.

| Item | Reference | Warrantly |
|---|---|---|
| Large Title / Title 2 / Title 3 and section | 34/41, 22/28, 20/25 | unchanged (the hierarchy that makes a screen read as iOS 27) |
| Body, Headline, Button | 17/22 | 16/21 (Material's body size) |
| Subhead / Footnote / Caption / Segmented | 15/20, 13/18, 12/16, 13.33/18 | 14/19, 13/17, 12/15, 13/17 |
| Page margin | 16 below 375, 20 from 375 | 16 on phones, 20 from 600 dp |
| Grouped card radius / text field radius | 26 / 14 | unchanged (round shapes are part of the look) |
| Row | min 52, padding 15 | min 46, padding 11 (rows still reach 44 dp+, text size grows them) |
| Detail and contact fields | 68 dp, label above value | one line: label (secondary, up to 45 %) left, value right; each wraps in its own column; label above value only when the column is under 260 text-adjusted dp |
| Form fields | label above a 44 dp field | label beside the field (32 %) from 300 text-adjusted dp; notes always full width |
| Library row | name, store, badge + date (3–4 lines) | name with the days-left badge beside it (badge wraps below only when the name would get under 55 %), then store · end date on one line; the date never breaks inside |
| Action pairs (View/Save, Save/Share) | side by side above 360 text-adjusted dp | side by side down to 240 text-adjusted dp |
| Section header spacing | 28 above, 8 below | 24 above, 8 below |
| Navigation bar | 60 | unchanged |
| Buttons | padding 11 × 20 | padding 10 × 16, still 44 tall |
| Large segmented | track 50, options 46 | options 40 (8 dp hit slop keeps 48+) |
| Settings avatar / detail photo | 60 / 56 | 48 / 52 |
| Sheet toolbar | 54 | 50 |

"Text-adjusted dp" is the content column divided by the font scale (`useRoom()` in `src/theme.ts`), the one rule
every beside-or-below choice uses. Button pairs also need room for their longest word (`pairWidth()`, so long
Hungarian words stack earlier); segmented controls drop their icons and dialog buttons take a full row before a word
would break in the middle. Font scaling stays on everywhere; nothing is forced onto one line or scaled with
transforms.

### Material (lines 23–25, 70–72, 142–150, 680–691)

Glass surfaces (tab bar, glass buttons) are `--glass-fill` over `backdrop-filter: blur(12px) saturate(1.9)`, plus
`--glass-edge` (light: inset 0 1 0 rgba(255,255,255,.9), inset 0 −.5 0 rgba(255,255,255,.4), inset 0 0 0 .5 rgba(0,0,0,.06),
0 2 8 rgba(0,0,0,.06); dark: inset 0 1 0 rgba(255,255,255,.18), inset 0 0 0 .5 rgba(255,255,255,.11), 0 2 6 rgba(0,0,0,.12))
and a sheen: a radial gradient 120% × 90% at 25% 0%, white .5 to transparent at 55%, at opacity `--glass-sheen` (.55 / .18).
The dark tab-bar surface uses its own edge: inset 0 1 0 rgba(255,255,255,.15), inset 0 0 0 .5 rgba(255,255,255,.08).

**Defined fallback:** where `backdrop-filter` is unsupported, or the user asks for reduced transparency or more
contrast, the reference replaces the glass background with `--material-solid` and drops the blur (lines 680–691). The
edge and sheen stay, except under reduced transparency, where the sheen is removed too.

Scroll edges replace dividers. Under the floating tab bar on phones: a gradient from transparent to `--bg` at 82 % (55 %)
to `--bg`, 80 + safe-area tall; dark mode at opacity .35 (lines 704–706).

### Motion (lines 45–48, 85, 154–157, 192–207, 390, 499)

| Token | Value |
|---|---|
| `--ease` | cubic-bezier(.23, 1, .32, 1) |
| `--ease-drawer` | cubic-bezier(.32, .72, 0, 1) |
| `--spring` | sampled damped oscillator, response 0.42 s, damping ratio 0.78 |
| `--spring-bounce` | response 0.42 s, damping ratio 0.62 (about 8 % overshoot) |

| Interaction | Behaviour |
|---|---|
| Row press | `--press` background at once (0 s), fades back over 0.3 s `--ease` |
| Button press | scale 0.97 in 0.1 s; Glass Prominent darkens to `--accent-down` is not set (hover only on pointers) |
| Glass button press | scale 1.1 in 0.22 s, release on `--spring-bounce` over 0.5 s |
| Tab press | glyph scale 0.86 in 0.12 s; lens moves on `--spring` 0.32 s |
| Switch | knob travels on `--spring` 0.32 s; track colour 0.25 s `--ease`; pressed knob grows to a 58 × 38 clear glass lens |
| Toast | slides from the top on `--ease-drawer` 0.42 s |
| Alert | opacity 0 → 1 and scale 0.96 → 1 over 0.2 s `--ease` |
| Reduced motion | all durations collapse and pressed scales are removed (lines 672–678) |

## What the reference does not define

These Warrantly needs have no counterpart on bencepc.hu, so their values are Warrantly's, built only from the tokens
above. They are not presented as measured matches.

- A days-left status badge. Warrantly uses the reference's soft/ink colour pairs (`--ok-soft`/`--ok`, `--warn-soft`/
  `--warn`, `--bad-soft`/`--bad`, `--fill`/`--ink-2`) on a radius-7 tag sized to Footnote text.
- A PDF page viewer and its zoom controls. The zoom pair uses the reference's `.pc-tools` capsule with `.round` 44 px
  buttons (lines 371–376), which is the closest existing control group.
- A PIN keypad (create, confirm, unlock, wrong PIN, lockout, fingerprint). Modelled on the iOS passcode screen, built
  from the reference's tokens; these are Warrantly's choices, not measured matches:
  - keys are the round glass control (`.glass-btn`: `--material`, glass edge and sheen) at keypad size, pressed scale
    1.1 on a fast spring and released on `--spring-bounce`, like the reference's glass buttons;
  - digits use the Large Title size at regular weight (the passcode keypad's thin numerals), capped at 120 % text so
    four rows always fit;
  - key size 78 dp, 70 dp below 760 dp of height and 60 dp below 680 dp (all above the 48 dp target); horizontal gap
    28 % of the key, rows 75 % of that;
  - Delete takes the empty bottom-right slot and is hidden until a digit is entered; fingerprint takes the bottom-left
    slot when it is on;
  - a wrong PIN or mismatch shakes the dots on a stiff spring (stiffness 900, damping 18; skipped with reduced motion)
    and shows the message in `--bad`;
  - the message keeps two lines of room, the footer keeps a control's height, the Continue button stays laid out
    (hidden) while confirming, and the keypad is anchored to the bottom, so no state moves the keys;
  - phones under 700 dp of height drop the decorative 56 dp icon tile so the keys and Continue fit without scrolling
    (checked at 360 × 640 dp).
- Product photos and product glyphs in list rows. Warrantly keeps its MaterialCommunityIcons product glyphs on a
  29 px icon tile, as the reference's hardware icons sit on coloured tiles. A user photo, or a Wikimedia
  Commons picture of the exact model, replaces the glyph in the same tile; the Commons credit sits under the detail
  hero in Footnote `--ink-2`.
- Large-text behaviour of the bottom bar. The reference caps tab labels at 13 px (130 %) instead of reflowing; Warrantly
  does the same with `maxFontSizeMultiplier`.

## Platform limits (Android, React Native 0.88, runtime 0.8.1)

- **No backdrop blur.** React Native 0.88 core has `boxShadow` (including inset), `backgroundImage` gradients and
  `filter`, but no `backdropFilter`. Warrantly's installed build has no blur module. Glass surfaces therefore use the
  reference's own defined fallback, `--material-solid` with the glass edge and sheen. This is **not** the blurred glass
  the reference shows in Chrome. A real blur needs `expo-blur` (native code): a new APK and a runtime version change.
  That was not done.
- **Icons.** The reference draws its own SVG sprite (`icons.svg`). Warrantly keeps Ionicons outline glyphs at the
  reference's sizes and colours. Using the sprite would need `react-native-svg` (native code, new build). Glyph shapes
  therefore differ.
- **Springs** are reproduced from their physical definition (response, damping ratio) with React Native's `Animated`,
  not from the sampled `linear()` curve. Reanimated is not installed.
- **Font.** Same family as the reference on Android (Roboto). On iOS the reference would use SF Pro; Warrantly is
  Android-only in this pass.

## How Warrantly applies it

| Warrantly surface | Reference pattern used |
|---|---|
| Library (`index.tsx`) | Large title + page search field (`input.quick-search`) + Headline section headers + grouped card of 60 px rows with a 29 px icon tile; filter is a nav-bar glass button; floating tab bar with Warranties, Add, Settings |
| Filter, More and document sheets | `.sheet`: floating sheet, grabber, 54 px toolbar with a glass close button, sections as grouped rows; selected row uses `--select` |
| Detail (`warranty/[id].tsx`) | Large-title head replaced by a hero (photo tile, Title 2 name, store, badge); documents first as a grouped card; Edit and More as nav-bar glass buttons; actions as `.btn` capsules |
| PDF viewer (`document.tsx`) | Nav bar + `.pc-tools` capsule for zoom (undefined in the reference for this purpose, see above) + footer capsules |
| Add / edit form | Grouped panels holding the standard text field; category chips as capsules (`--fill`, selected `--select`/`--tint-ink`); Save as Glass Prominent capsule in a footer that rises above the keyboard |
| Settings | Grouped rows with icon tiles, switches, large segmented pickers (theme, language), small segmented (backup interval) |
| Dialogs | `.link-alert` geometry for every `Alert.alert` call (`showAlert`): Cancel `--fill`, primary `--accent`, destructive actions `--fill` with a `--bad` label |
| Onboarding, PIN, lock | Large title, standard field, capsule buttons; PIN and lock use the keypad in "does not define" with a 56 dp tile, Title 2 heading and Subheadline message |

Warrantly-only token choices (not reference values): the badge tones (ok and expired `--fill`/`--ink-2`, warning `--warn-soft`/`--warn`, under 30 days `--bad-soft`/`--bad`), the product-category tile colours (system blue, indigo, green, orange, teal, grey, cyan), and the destructive dialog action (`--fill` with a `--bad` label; the reference alert has no destructive action).

## Discrepancy checklist

Compared on the Android emulator (1080 × 2400) at 360, 390 and 430 dp against the reference in the same emulator's
Chrome, light mode, English, 100 % text. Side-by-side and 50 % overlay images: `.expo/ui-review/ios27/shots/compare/`
(local, not committed). Chrome's viewport starts below its toolbar, so app shots are cropped by the 136 px status bar
to line up the page tops.

| # | Item | Result |
|---|---|---|
| 1 | Page gutter (16 / 20), large title size and position, section header inset | Match at all three widths (overlays line up within a few px) |
| 2 | Grouped card radius, row height, separator insets, chevron | Match |
| 3 | Nav-bar glass button size and trailing inset | Match |
| 4 | Page search field | Fixed in this pass: was the `.side-search` capsule, now the reference's `input.quick-search` (card field, no glyph) |
| 5 | Tab bar width, side margin, height, lens radius | Match at 430 (61–62 dp tall in both); lens is wider because Warrantly has 3 tabs, not 4 |
| 6 | Tab bar vertical position | Differs only because Chrome's viewport ends above its own bottom UI; both sit the reference's bottom offset above their viewport edge |
| 7 | Sheet: side and bottom float, corner radii, grabber, toolbar, close button, title | Match |
| 8 | Alert: width 300, radius, padding, button height, colours | Match; a third action stacks full width (the reference only shows two side by side) |
| 9 | Glass surfaces (tab bar, glass buttons, alert, sheet chrome) | **Open, platform limit**: no backdrop blur, so they use the reference's `--material-solid` fallback. They read flatter and whiter than the blurred glass in Chrome |
| 10 | Bar scroll edge | **Open, platform limit**: the gradient matches the reference stops, but without the reference's 8 px blur, text scrolling under the bar stays faintly visible (about 18 % at title height) instead of being blurred away |
| 11 | Icons | **Open, platform limit**: Ionicons outline glyphs at reference sizes; shapes differ from the reference sprite |
| 12 | Tab bar minimises to the current tab while scrolling down | Fixed in this pass: same thresholds (60 / 40 / 24 dp) and compact sizes (surface 72/54, lens 64/54 of the tab height), on `--spring`. Adapted: width animation instead of `scaleX` with elliptical radii, which React Native lacks. Kept expanded while TalkBack is on (the reference expands on focus) |
| 13 | Switch pressed lens (knob grows to a 58 × 38 glass lens) | **Open, not implemented**: the knob slides on the spring without the lens |
| 14 | Reduced transparency / more contrast | **Open**: Android has no reduced-transparency setting; Warrantly already uses the solid fallback everywhere. High-contrast text is not handled separately |
| 15 | Settings back button | Intended difference: Settings is a pushed screen in Warrantly (destinations preserved), the reference's Personal page is a tab root |

## Verification runs (emulator, Android 16, 1080 × 2400)

Screenshot tours (local only, `.expo/ui-review/ios27/shots/`): 14 surfaces each (library, filter sheet scrolled, search
with keyboard, detail and scrolled detail, More sheet, PDF viewer, edit form and edit with keyboard, three Settings
screens, delete dialog), plus the compact tab bar, secondary pages (ignored, restore, help, what's new, privacy, backup
password) and a clean install (onboarding with keyboard, PIN offer, PIN setup, empty library, lock screen).

| Run | Width | Text | Language | Theme | Result |
|---|---|---|---|---|---|
| en360 | 360 | 100 % | English | light | pass |
| en390 | 390 | 100 % | English | light | pass |
| en430 | 430 | 100 % | English | light | pass |
| en390L | 390 | 160 % | English | light | pass |
| hu360L | 360 | 160 % | Hungarian | light | pass |
| hu430 | 430 | 100 % | Hungarian | light | pass |
| dk430 | 430 | 100 % | English | dark | pass |

Long names (the 60-character store "Zeta Appliances and Home Electronics Outlet, Budapest Central") wrap in rows and
sheets; tab labels stop growing at 130 %; the edit form's Save stays above the keyboard; sheets scroll to the last row.

Platform note for local testing: `clearState` / `pm clear` also wipes the dev build's `debug_http_host`, and the app
then loads the bundle from `10.0.2.2:8081`, which may be another checkout. Restore the preference before such runs.

Regression flows replayed locally against this checkout's bundle: `ui-polish` (exported PDFs byte-identical to the
source), `ui-polish-large` (720 × 1600, 320 dpi, 160 % text), `sheet-scroll` and `form-source` all pass. Unit tests
93/93, `tsc --noEmit` clean, `expo lint` with only the existing `i18n.use` warning.
