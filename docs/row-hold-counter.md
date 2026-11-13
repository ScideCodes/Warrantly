# Warranty row holds and countdowns — 13 November 2026

The previous alignment change kept the badge in its column but capped its width at 50%, allowing its
full sentence to wrap. Row badges now use compact translated text (`1826d`, `1826 nap`, negative values
for expired covers, Today/Ma). They stay on one line, with font fitting for constrained accessibility
layouts. The row and badge retain the full translated wording for accessibility; detail and widget
wording is unchanged.

A native Android reproduction found a separate long-press bug: selecting a row then releasing the
finger immediately returned to zero selected items. Entering bulk mode removed the long-press callback
while the gesture was active. React Native Pressability then treated release as an ordinary tap.
The callback now remains present through the entire gesture, so selection happens once.

Rows also drove their background through JS Animated inside a Reanimated themed touch surface.
Feedback now animates native opacity on a separate, non-interactive overlay, keeping touch targets
stable and removing the competing background animation paths. Nested document buttons use native
Pressable feedback. This retains the row's 300 ms release fade.

Verification:

- Native debug build on a disposable Android API 37 emulator, using the current source through Metro.
- `.maestro/warranty-hold.py`: selecting by long hold retains exactly one selected item after release;
  holding an already-selected item does not toggle it; row and document-button crops remain identical
  across six screenshot samples after the initial feedback settles. Test gestures/selections are cleared.
- 320dp width, Hungarian, 1.6x system font: 1826-day and 7-day counters remain on one line to the right.
  The long product name uses two lines; the full countdown wording remains in accessibility labels.
- Typecheck and lint passed (one existing i18next warning); all 140 unit tests passed.

The release-to-deselect issue was reproduced before the fix. Continuous physical-device flicker was
not independently reproduced; the new native hold regression passed with steady feedback.
