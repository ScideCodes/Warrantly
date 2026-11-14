# Accent colours

Uses Impeccable/Unslop for the existing iOS27 controls, Ponytail for a small shared implementation, and Caveman/ADHD for concise reporting.

- Settings > General > Accent colour: Blue, Teal, Green, Purple, Orange, plus custom six-digit hex with preview and explicit Apply. English/Hungarian labels.
- Shared palette updates immediately without leaving Settings. Custom/preset hues adapt their button and text contrast in light/dark themes; semantic warning/error colours stay intact. Blue preserves the original reference palette.
- Selection persists locally and travels in settings backups. Widget action/badge accents follow the selection too. No dependencies, native permissions or rebuild required.
- Focused checks only, as requested: typecheck; lint (existing i18next warning only); four accent/theme tests, covering extreme custom colours, text/button contrast in both themes, invalid input and live theme/accent switching.
