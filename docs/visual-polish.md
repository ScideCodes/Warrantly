# PIN and shared visual polish

The PIN screen uses one balanced column for its identity, heading, status, entry dots, keypad and action.
Setup has a two-step indicator and separate choose/confirm instructions in English and Hungarian. Reserved
message, heading and footer space keeps confirmation and error states from moving the keypad. Short screens
drop decorative branding and use smaller keys; large text can scroll. Biometrics, recovery, PIN limits and
lockout checks keep their existing behavior. Error messages clear when the next attempt starts.

The circular glass keys use brief press feedback and a visible error shake, both respecting Reduce Motion.
Key sizes remain at least 48 dp. Fingerprint and delete share the same grid geometry.

Shared refinements across the app:

- Android font padding is removed from the type ramp and shared Text component for consistent baselines.
- Card and document separators use physical hairlines.
- Buttons use one layout node, so paired actions stretch to the same height when a label wraps. More compact
  horizontal padding helps labels stay beside their icons on narrow phones. Their press scale uses UI-thread
  CSS transitions; disabled controls have a neutral fill and readable label instead of washing out the whole control.
- Dialog buttons follow the normal button type ramp. Settings' profile avatar uses the app's tint palette.
- Product thumbnails contain the entire image instead of cropping it; missing-image fallbacks are preserved.

## Verification

Android emulator through Metro, synthetic data only:

- PIN choose/confirm, mismatch, six-digit setup, cold-start lock, wrong attempt, successful unlock and disabling
  the lock: `.maestro/pin-polish.yaml` passed.
- Narrow dark-mode tour: library, filter, warranty detail, document viewer, photo dialog, form and Settings.
- At 360 × 640 dp: PIN zero key and Continue remain visible; form import actions stay side by side.
- Hungarian at 360 × 800 dp and 140% text: setup/confirmation, Settings, Help, Privacy, ignored mail,
  What's New and backup password screen. Large text scrolls rather than clipping.
- 109 unit tests; typecheck and lint (the pre-existing i18n warning only).

This is emulator verification, not a claim of physical-device, iOS or screen-reader testing.

Screenshots: [dark PIN](screenshots/pin-polish-dark.png), [short-screen PIN](screenshots/pin-polish-short.png).
