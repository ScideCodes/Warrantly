# Accent colours

Uses Impeccable/Unslop for the existing iOS27 controls, Ponytail for a small shared implementation, and Caveman/ADHD for concise reporting.

- Settings > General > Accent colour: Blue, Teal, Green, Purple, Orange, plus custom six-digit hex with preview and explicit Apply. English/Hungarian labels.
- Shared palette updates immediately without leaving Settings. Custom/preset hues adapt their button and text contrast in light/dark themes; semantic warning/error colours stay intact. Blue preserves the original reference palette.
- Selection persists locally and travels in settings backups. Widget action/badge accents follow the selection too. No dependencies, native permissions or rebuild required.
- Focused checks only, as requested: typecheck; lint (existing i18next warning only); four accent/theme tests, covering extreme custom colours, text/button contrast in both themes, invalid input and live theme/accent switching.

Published [OTA 9](https://github.com/ScideCodes/Warrantly/releases/tag/v1.0.0-ota.9), app commit `dccfcd0`, Android preview runtime 1.0.0, group `a29a06be-8b51-44b2-b7aa-0aa1ce2f34cc`. Signed app received/applied it. Checked Purple preset, custom Apply, and light/dark switching in Settings; inspected both theme captures. No recent JS/runtime errors. Restored the review emulator to Blue/Light. Full regression suite and physical widget testing skipped to keep verification focused as requested.
