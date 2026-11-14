# PIN screens, black-screen investigation, product pictures — November 13, 2026

Emulator: Android 16, 1080 × 2400 (and 720 × 1280 at 320 dpi for a 360 × 640 dp phone), debug build on this
checkout's Metro bundle. Flows, recordings and frame scans are local only (`.expo/ui-review/blackscreen/`).

## 1. PIN screens

Create, confirm, mismatch, unlock, wrong PIN, lockout and unlock after the wait were driven by Maestro and
screenshotted. Design decisions are listed in `visual-reference.md` ("What the reference does not define").

| Run | Screen | Text | Language | Theme | Result |
|---|---|---|---|---|---|
| p1 | 1080 × 2400 | 100 % | English | light | pass, 7 states |
| p3 | 1080 × 2400 | 160 % | English | dark | pass, 7 states |
| h1 | 360 × 640 dp | 100 % | Hungarian | light | pass, 6 states |

Found and fixed during the runs:

- At 160 % the keys jumped about 38 px when the three-line hint became a two-line error, and again on the confirm
  step, which had no Continue button. The keypad is now anchored to the bottom and Continue stays laid out (hidden)
  while confirming; the keys no longer move between states.
- On a 360 × 640 dp phone Continue was below the fold. Short phones (under 700 dp) now drop the decorative icon tile
  and use 60 dp keys; everything fits without scrolling.

Unchanged: PIN validation, the 5-try lockout (30 s, doubling, at most an hour), relock after 3 minutes, biometrics,
and "Forgot PIN" via the device lock. The lock screen still appears on a cold start (checked separately).
Not checked on a real device: the fingerprint key (the emulator has no enrolled fingerprint).

## 2. Black screen while scrolling (one report, intermittent)

Not reproduced. Nothing is claimed fixed.

What was exercised, with the screen recorded at 15 fps and every frame scanned for (a) a mostly black frame and
(b) a frame with far less content than usual:

| Run | Theme | Text | What ran | Frames | Black | Empty |
|---|---|---|---|---|---|---|
| light1 | light | 100 % | 61-warranty list: 24 fast flings with reversals, filter sheet flung open and dismissed by swipe, detail flung, Settings flung, Home and resume | 1311 | 0 | only the cold start |
| dark1 | dark | 100 % | the same | 1315 | 0 | only the cold start |
| flip1 | light → dark → light, 16 system theme flips during the run | 160 % | the same | 1603 | 0 | only the cold start |

The only empty frames are the 6 seconds between launch and the debug bundle's first render (a white page; the dev
loader, not the release splash). Logcat had no FATAL, ANR, OpenGL/Surface error or JS error in any run.

Code reviewed: the list (`SectionList`, plain rows, no blur, no off-screen rendering), the bar and tab-bar
animations, sheets, PDF pages (bitmaps capped at 2400 px), `_layout.tsx`, the error log and update reload.

Findings:

- With Appearance on Auto, a system theme change while the app is open is ignored until the next start (the palette is
  read once at launch). The app then shows a light page on a dark system, or the reverse after a restart. This is a
  theme mismatch, not a black screen, but it is the one real inconsistency found.
- In dark mode the page background is pure black (#000, the reference's value), so a page whose content has not
  rendered yet looks like a black screen. No such frame was captured.

Added diagnostic (narrow, no user data): when the system theme changes while the app is open and the app keeps the
old palette, one line is written to the on-phone error log ("system theme now dark, app shows light until restart").
Verified on the emulator. If the report recurs, a feedback mail with the log shows whether this happened.

Update (November 2026, docs/compact-theme.md): the palette is now live. Auto follows a system change at once (also
one made while Warrantly was in the background), so the mismatch above no longer happens, and the diagnostic was
removed. The black screen itself was not reproduced again; it is not known to be fixed.

Not tested: the PDF viewer at high zoom, a release build, a real device, low memory.

## 3. Product pictures as warranty icons

> **Removed on 13 Nov 2026.** Warrantly no longer looks pictures up online: the Settings switch, the background
> lookups, "Find a picture online" and the picture credit are gone, and nothing is sent to Wikimedia. Only the
> person's own photo (camera or gallery) is kept. Phones that held found pictures delete them once on the next
> list load (`src/legacyPictures.ts`). What follows is history.


Source: Wikidata (which item is it, its P18 image) and Wikimedia Commons (thumbnail, author, licence). Free, no key,
openly licensed; the credit (author, licence, link to the file page) is shown under the detail hero. Requests carry an
identifying User-Agent, as Wikimedia's policy asks, are spaced 1.1 s apart and stop for an hour on HTTP 429/503.
Only the product name is sent. On by default (switch in Settings > Product pictures); "Find a picture online" on a warranty
looks up one. No paid service, no credentials.

Rules: the user's photo always wins; a picture only for a high-confidence model match (name contained in the product
name, at least two words, a model number, no extra variant or generation, no accessory, no series, no tie); otherwise
the category icon. Thumbnails are stored on the phone (shown offline, included in backups). Lookups run after the list
loads, never from a row, so scrolling starts none. A renamed warranty drops the old picture and is looked up again; a
result for a name changed during the lookup is discarded. Remove found picture keeps it removed for that name.

Found and fixed during the native run:

- Commons now serves thumbnails from `thumb.wikimedia.org`; only `upload.wikimedia.org` was accepted, so every
  picture was dropped.
- "Samsung Galaxy S24+" read as "Samsung Galaxy S24", which made a tie with the S24 and no picture. "+" now reads
  as "plus".
- Downloads used Android's default agent, which Wikimedia answers with 403. The download now sends the same
  identifying headers.
- Offline, every list load logged "picture lookup stopped". Offline is now quiet and retried later.

| Run | Theme | Text | Result |
|---|---|---|---|
| q1 | light | 100 % | Samsung Galaxy S24 128GB and Logitech MX Master 3S get their Commons pictures; Apple iPhone 15 (only Plus/Pro on Wikidata) and iPhone 15 Pro case keep the category icon; credit shown; menu offers Remove found picture |
| q2 | dark | 160 % | same, and Remove found picture returns the detail to the camera tile and the row to the category icon |
| offline | light | 100 % | network off: category icons, nothing recorded (so a later list load tries again), no error logged |

## Checks

Unit tests 105/105 (`productImage` 12, including the S24/S24+ and `thumb.wikimedia.org` cases), `tsc --noEmit`
clean, `expo lint` with only the existing `i18n.use` warning. Regression flows replayed on a clean install:
`ui-polish` (exported PDFs byte-identical to the source), `ui-polish-large` (720 × 1600, 320 dpi, 160 % text),
`sheet-scroll` and `form-source` all pass.
