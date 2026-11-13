# Optical alignment review — November 13, 2026

Reviewed the native design pass (`497ca6f`) and subsequent changes. The newer README/release-preparation commits were preserved.

## Corrections

- Shared `components/Icon.tsx` gives font icons a stable em-square layout, removes Android font padding, and applies small size-relative optical corrections to asymmetric glyphs. Back/forward, funnel, download, edit, share, shield, backspace, and checkmark corrections are defined once for every control that uses them. Product/category icons use the same layout treatment with their existing font.
- Buttons, settings tiles, sheet rows, document controls, disclosure controls, PIN/lock controls, and navigation now use those shared renderers. Text labels retain their existing scaling behavior.
- The collapsed tab previously faded its label without removing its layout space, leaving the visible icon high in the capsule. Its icon now shifts by half the measured label height plus the gap as the bar collapses, so its resting position is centered at either text scale.
- Toolbar sides reserve equal space based on the actual leading/trailing control widths. Long titles shrink within the remaining space instead of crowding a pair of trailing buttons.
- Tabs have stable test IDs for selecting the real control when a compact header has the same visible title.

## Verification

- 93 unit tests pass; typecheck passes; lint has zero errors and the existing `i18n.use` warning. `git diff --check` passes.
- Native Android screenshot/action tour passes at approximately 393dp in light mode with normal text: home, collapsed tab, filter, settings, segmented controls, detail, More sheet, rendered PDF viewer, and scrolled detail toolbar.
- The same native tour passes in dark mode with 160% system text.
- Screenshots and JUnit results are local ignored artifacts under `.expo/ui-review/optical-final/` and `.expo/ui-review/optical-dark-large/`. The final tours ran after source edits were complete. Earlier exploratory screenshots taken during Fast Refresh are not final evidence.
- Some immediate transition captures precede complete font/animation settling; a separate settled screenshot confirmed the toolbar glyphs are present. Compare settled states when judging optical alignment.

No production dependency or native module was added. No OTA update was published by this pass. Physical-device and iOS appearance were not verified.
