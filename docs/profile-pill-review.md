# Profile pill and visual review

- The existing Settings profile card changes into an editor in place. The input replaces the name and Save/Cancel stay inside that card. There is no second editor card or pressable parent around the input.
- The avatar keeps its size on narrow screens. Action buttons may wrap when space requires it.
- Home summary counts share a top alignment, so a translated label wrapping to two lines no longer shifts its number above its neighbors.

## Verification

- Android emulator: normal text and 200% text at 320dp width, including three-button navigation.
- Reviewed screenshots by eye of the profile display/editor, PIN screen, Settings controls in light/dark themes, warranty list and warranty detail. Existing shared icon optical corrections remain in use; no additional glyph offset was justified by these screens.
- Saved a changed name and verified it after activity recreation. Empty input disables Save; Cancel retains the stored name.
- Summary number bounds have matching vertical coordinates after the change; screenshot also checked visually.
- Typecheck passes; 142 tests pass. Lint has zero errors and the existing i18next default-import warning.

This is a focused emulator review, not a guarantee that every screen on every physical device is free of defects.
