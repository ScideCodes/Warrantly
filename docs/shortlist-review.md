# Independent shortlist review — 13 November 2026

Reviewed Claude's `aeb3d11` feature commit and `3726c9d` channel configuration. This is a source review with automated checks; the original checklist's emulator labels are not independent proof of those flows.

## Implemented

The code contains the compact density setting, translated System theme label, summary filters, document shortcuts, sorting, favorites, bulk actions, claims, collections, custom reminders, document labels, completeness checks, persisted inbox, bundles, recent items, backup health screen and transfer screen. Migration/restore tests cover old and new data. Widget code includes responsive tiers, quick actions, return mode, optional personal photos, attention badge, per-instance settings and light/dark/System rendering.

## Fixed during this review

- Document OCR formerly stopped after page four but marked the entire file indexed. It now reads every page in two-page native batches, consuming each batch before the shared temporary directory is reused. Cancellation stops between pages without recording a failed document. The running guard is acquired before database awaits so two screens cannot index concurrently.
- Duplicate merge could discard a live shared receipt when the retained item's copy was pending deletion. Deduplication now requires live, unassigned copies on both items; claim-linked attachments retain their associations. Regression coverage verifies the live receipt survives deletion cleanup.
- Aligned Expo, SQLite, Gesture Handler and Worklets with Expo SDK 58's recommended versions. `expo install --check` now passes; tests, typecheck and lint were repeated afterward.

Files already marked indexed by the old code need an explicit index retry/rebuild to include later pages; this change does not silently invalidate every existing scan.

## Remaining differences from the full brief

| Area | Present | Still incomplete |
|---|---|---|
| Document search (8) | Local OCR, progress, retry/cancel, normalized matching | File-path cache has no content revision invalidation; live search refresh after background indexing needs device verification. |
| Thumbnail cache (14) | Native first-page previews, cached name/width/mtime | JS `DocThumb` map has no size bound; cached image load failure lacks an image error fallback. |
| Transfer (18) | Field/file selection, privacy exclusions, Warrantly export and summary PDF | Structured claims are absent from the share format. PDF is a summary, not a combined attachment PDF; originals are sent unchanged. |
| Backup health (20) | Off/failed/never/overdue/pending/ok and retry | No explicit working state. Account switching and restore need tests for pending-file bookkeeping. |
| Widget deadlines (25) | Separate expiry and returns modes | No combined urgent expiry/return overview. |
| Widget imagery (26) | Optional small personal photos, respecting name visibility | No category icon fallback within widget rows. |
| Widget configuration (27) | Per-widget content, names, photos, actions | No favorites or selected-collection content mode. Launcher preview still old; provider text remains fixed strings. |
| Widget privacy (30) | Per-widget name visibility and optional photos | No separate purchase-value control. Values currently are not rendered. |

No claim is made that all 30 requirements have been verified end to end or that these gaps are finished.

## Verification and compatibility

- `npm test`: 140 passed, zero failures, including seven-page OCR, cancellation, malformed renderer output and merge/delete retention regressions.
- `npm run typecheck`: passed.
- `npm run lint`: zero errors; one existing i18next default-export warning in `src/i18n/index.ts`.
- Runtime is **0.9.0**. Camera, PDF native methods and widget configuration require a new 0.9.0 Android APK. Existing 0.8.x installations cannot receive this feature set via OTA alone.
- EAS cloud Android build was rejected because the account's monthly quota is exhausted. A local release build uses the existing EAS signing credentials; no paid plan change was made.
