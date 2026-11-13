# Claude implementation prompt — complete Warrantly shortlist

Implement the complete approved feature list below in the existing Warrantly app. This is implementation work, not a mockup, proposal, or UI-only demonstration. Work through it in tested stages until every requirement is implemented or a specific, verified platform blocker is documented. Do not silently drop features or replace working flows with placeholders.

Workspace: `C:\Users\Bence\Documents\ChatGPT\Warrantly 2`.

## First inspect the current work

Read AGENTS.md, git status/diffs, package.json, the database/migrations, routes, shared UI, theme store, translations, document/share inbox, reminders, backup/export and widget implementation. Treat the actual working tree as authoritative, including uncommitted work. There are active edits in this workspace; preserve them and do not reset, overwrite, or stash someone else's work without resolving ownership. If GitHub advances, integrate the new work and retest rather than force-pushing over it.

At prompt preparation, local work removes automatic online product-image lookup and keeps personal photos with category-icon fallbacks (`photo.ts`, `legacyPictures.ts`). Preserve that direction; do not resurrect deleted Wikimedia lookup code. Widget thumbnails should use saved personal photos, with category icons when absent or unreadable. Adapt to any subsequent intentional changes you find.

Reuse and extend existing scanning/OCR, Gmail import/merge, sharing, repair notes, global reminders, backup, document viewer and PIN protection. The approved list includes improvements to existing features, not requests to create duplicate systems.

## Use these installed skills

Open and apply the actual SKILL.md instructions before the relevant work:

- `mobile-app-ui-design`: `C:\Users\Bence\.agents\skills\mobile-app-ui-design\SKILL.md` — compact information hierarchy, clear actions, mobile layouts and meaningful empty/error states. Apply its principles to native UI; avoid its HTML/Tailwind examples and oversized generic spacing when they conflict with this app.
- `animate-expo`: `C:\Users\Bence\.agents\skills\animate-expo\SKILL.md` — UI-thread motion, stable touch targets, interruptible feedback and reduced-motion support. Preserve the recent hold/flicker fix and the separate animated selection lens.
- `react-native-patterns` / `ecc:react-native-patterns`: `C:\Users\Bence\.codex\plugins\cache\ecc\ecc\2.2.3\skills\react-native-patterns\SKILL.md` — Expo Router, bounded background work, virtualized lists, state ownership, cleanup and native accessibility. Keep the existing SQLite/StyleSheet architecture; examples are not a mandate to add a new state library or rewrite local storage.
- `apple-design`: `C:\Users\Bence\.agents\skills\apple-design\SKILL.md` — restrained hierarchy, consistent materials and immediate feedback. Use design principles, not browser-specific implementation recipes.

If a skill path has moved, find the matching installed skill. Do not install unrelated plugins or replace the app's architecture to satisfy an example in a skill.

Read the installed Expo major from package.json before changing Expo/React Native APIs. It was SDK 58 when this prompt was prepared. Fetch the matching versioned Expo docs, then `https://docs.expo.dev/llms.txt` and the specific API pages as needed. Verify installed gesture/Reanimated/widget APIs instead of assuming versions. Use `npx expo install` for new dependencies in this npm project. Do not hand-edit generated native directories.

## Design contract and System labels

Preserve Warrantly's established bencepc.hu-inspired glass styling, palette, optical alignment, typography and smooth light/dark transitions. Make it more useful and compact: reduce excessive header/section gaps, keep related values beside one another where they fit, and keep primary actions easy to reach. Keep readable text, safe areas and adequate touch targets. Do not fill space with decorative charts or huge dashboard cards.

Add a persistent **Compact / Comfortable** list-density preference. Compact reduces padding and secondary clutter, not accessibility or legibility. Preserve all three visible navigation destinations while scrolling. Long labels must reflow as whole controls without splitting words, clipping or shrinking text to unreadable sizes.

The theme selector must read **Light / Dark / System** in English and **Világos / Sötét / Rendszer** in Hungarian. Keep stored enum `system` unchanged. Update accessibility labels and related explanatory text. The language selector's device-following option must also read **System / Rendszer**, replacing current **Phone / Telefon**. Remove **Auto** as the theme option's visible label; use natural, consistent translations across the app and widget settings.

## Approved app features — implement all 1–22

1. **Compact home summary:** one slim, tappable summary of covered warranties, expiring soon, and missing receipts/documents. Each count opens the corresponding filtered results. Derive counts from real data and define the expiring-soon period clearly.
2. **Direct document access:** add an accessible document action on warranty rows. Open the only document directly; show a compact picker when there are several. Missing documents offer an actionable recovery path. Preserve tapping the row to open details.
3. **Sort and quick filters:** expiry date, recently added, price and product name; quick filters for expiring warranties and missing documents. Combine with search, store/category/account filters and clear/reset. Define deterministic handling of missing prices and multiple currencies; do not silently invent conversion rates.
4. **Favorites:** pin/unpin warranties, persist the choice and surface favorites without duplicating records. Define how pinning interacts with sorting and filtering.
5. **Bulk actions:** explicit multi-select mode with count, select-all for the current results, cancel, and bulk document export, categorization and archive. Archived is distinct from expired and deleted. Confirm destructive changes and preserve undo where appropriate.
6. **Claim tracking:** extend repair/history notes into dated claim records with Submitted → In repair → Resolved status, supporting notes and attachments. Support multiple claims per product and preserve existing history. Do not automatically send messages or claim a repair succeeded.
7. **Collections:** user-created groups such as Kitchen, Gaming setup and Work equipment, including owner/room/purpose organization. Support rename, membership changes and removal without deleting warranties. Reuse categories rather than making confusing duplicates.
8. **Document full-text search:** search saved receipt/PDF text, including order and serial numbers. Extract text/OCR locally using verified supported APIs. Index in bounded background batches with progress, cancellation/retry and cached results; no OCR on scroll or keystrokes. Index new/changed documents, clean up deleted ones, and retain original files. Surface matches that open the correct document. Do not label filename-only search as full-text search.
9. **Undo:** offer undo for accidental warranty deletion, document removal and category changes. Retain recoverable data/files until the undo window expires, then clean up safely. Handle app closure and shared document references consistently.
10. **Duplicate detection:** identify likely overlaps across Gmail imports, scans and manual additions. Show why items might match and let the user review/merge. Preserve documents, photos, claims, history and distinct coverage plans; do not auto-merge merely similar products.
11. **Serial-number scanner:** scan printed serial text or a relevant barcode with a confirmation/edit step and manual fallback. A retail product barcode is not automatically a unique serial number. Handle camera denial and unavailable hardware.
12. **Custom reminders:** set per-product reminder dates in addition to existing global reminders. Edit/remove them, prevent duplicates, and reconcile them after edits, archive/delete, restore and timezone/date changes. Respect permissions and platform scheduling limits.
13. **Document labels:** Receipt, Warranty card, Repair report, Extended coverage and Other. Persist labels, allow corrections and show them consistently in details, pickers, search, exports and backups.
14. **PDF thumbnails:** small first-page previews with cached, bounded generation; placeholders and useful fallbacks for corrupt/missing files. Keep scrolling fast and preserve pinch zoom, panning, save and share.
15. **Completeness check:** identify meaningful missing receipts, serial numbers or coverage dates, explain each issue and provide a direct fix. Distinguish optional suggestions from fields required for a valid warranty; do not block saving an otherwise usable record.
16. **Document inbox:** persist incoming shared/imported photos and PDFs awaiting assignment. Let users preview, assign to an existing warranty, create a new one or discard deliberately. Survive app restarts and avoid duplicate processing or lost attachments.
17. **Purchase bundles:** group products from one purchase/receipt while retaining separate cover dates and coverage plans. Shared receipts remain available if one product is removed. Merging, undo, export and backup must preserve relationships.
18. **Transfer a product:** build a reviewable export containing selected warranty details, documents and repair history for a sale/gift. Let users remove personal details and choose files. Never claim an original PDF is redacted just because metadata was hidden; produce a genuinely redacted copy or clearly exclude the original when a privacy-safe package is requested. Transfer must not delete the owner's records or share anything automatically.
19. **Document-only view:** browse/search/filter all saved documents directly, see their labels and linked products, and open/save/share them without navigating through each warranty.
20. **Backup health:** show last successful backup, failures and genuinely pending changes/documents. Base protected/pending states on completed backup metadata, not a cosmetic timestamp. Include an actionable retry/details route and distinguish disabled, never backed up, working, failed and current.
21. **Quick capture shortcut:** a supported home-screen shortcut opens scanning directly through the normal lock and permissions flow, with cancellation and manual/import alternatives.
22. **Recently opened:** a small collapsible section for recently accessed warranties/documents. Persist a bounded history, deduplicate entries, remove deleted targets, respect privacy, and allow clearing it.

## Approved widget update — implement all 23–30

The existing Android widget shows one next expiry with a fixed white background. Extend the real widget implementation, not an in-app imitation.

23. **Responsive sizes:** small shows the next deadline; medium shows up to three relevant items; large adds more items plus counts and quick actions. Adapt to actual available dimensions, font scale and launcher resizing. Avoid empty padding, clipped names or cramped controls.
24. **Quick actions:** Scan receipt, Add warranty and Search open the correct app flow directly, respecting the PIN lock and preserving the intended destination after unlock.
25. **Return deadlines:** surface approaching return deadlines alongside warranty expiries with distinct, clear labels. Use existing supported deadline data/rules; do not invent new return rights. Prioritize urgent actionable deadlines and distinguish expired coverage from future deadlines.
26. **Product pictures:** use saved personal product photos, with category-icon fallbacks. Cache/size images for widgets and handle missing files. Respect per-widget picture privacy; do not restore removed online lookup functionality.
27. **Content configuration:** let each placed widget show upcoming deadlines, favorites or a selected collection. Persist settings per widget instance and handle an empty/deleted collection gracefully.
28. **Attention indicator:** a compact real count of items needing details/documents, opening the matching results. Avoid redundant banners and misleading counts.
29. **Match the app theme:** the widget follows the app's stored Light/Dark/System setting exactly. Explicit Light or Dark overrides the phone. System resolves the phone's current appearance. Refresh every placed widget when app theme changes, and support system appearance changes when the app is closed through verified platform mechanisms. Handle headless rendering without depending on mounted React screens. There must be no independent widget theme selector that can contradict the app. Reuse shared palette values through a widget-compatible data layer, keeping launcher contrast readable.
30. **Configurable privacy:** per-widget controls for names, photos and purchase values. Preserve the existing protective defaults while app lock is enabled. Hidden text must not remain exposed in accessibility descriptions or previews. Tapping any item opens the correct protected app screen without bypassing the lock.

Keep widgets fresh after relevant edits, imports, merges, favorites, collection changes, removals, restore, language/theme/privacy changes and scheduled date changes. Test multiple placed instances and launcher resizing. Preserve compatibility with existing `NextExpiry` widgets where possible. Update the widget preview assets and translated labels/descriptions to represent the actual implementation.

## Implementation order and data integrity

Create a concise implementation checklist in `docs/shortlist-implementation.md` with IDs 1–30 plus density/System labels, affected areas, dependencies and verification status. Keep it current. First identify already-complete behavior and record evidence; extend it rather than duplicating it.

Work in coherent stages: (1) schema/migrations and core models; (2) density, home navigation, System labels, favorites/sorting; (3) documents, inbox, indexing, thumbnails and bundles; (4) bulk actions, undo, duplicate review, claims, custom reminders and transfer; (5) backup health, recent items and shortcuts; (6) responsive themed widgets; (7) integration checks and release. Adjust ordering for dependencies but complete the whole checklist.

Use backward-compatible SQLite migrations and real persistence. Update backup/restore/export/import schemas for every new model and relationship, including old-backup compatibility and validation of imported files. Cover interrupted operations, duplicate ingestion, orphan cleanup and shared document ownership. Preserve existing user warranties, photos, attachments, settings and history. No destructive migration to simplify implementation.

Keep work asynchronous and bounded: stable virtualized rows, indexed queries/search, cached thumbnails/OCR, no heavy work during render or per animation frame. Preserve PDF gestures, held-button stability, visible navigation, Settings scroll position and form contents during theme changes. All user-facing strings and accessibility labels must be correctly translated in EN/HU.

## Verify and finish

Run typecheck and lint as AGENTS.md requires, plus relevant existing/new tests. Add meaningful tests for migrations/old-backup restore, sorting/filter combinations, duplicate/bundle merges, undo/file retention, index invalidation, custom reminder reconciliation, transfer privacy and backup health. Exercise actual native UI flows on synthetic data: import → inbox → assign/create → search/open PDF; favorite/collection/bulk/undo; claim/transfer; restore; widget navigation through PIN. Keep emulator/browser work in the background.

Check empty/loading/error/offline states, permissions denied, missing/corrupt files, long names, EN/HU, narrow phones, large text, light/dark/System and reduced motion. For widgets, verify theme changes while the app is closed, each size, multiple instances and privacy-hidden content. Record screenshots and concrete test results. Distinguish emulator checks from physical-device release performance; do not claim measurements you did not make.

After validation, commit and push the completed work, preserving unrelated edits. Follow `docs/releasing.md` and the existing release script. Determine native compatibility before publishing: widget/provider configuration, new native modules, scanner/shortcut capabilities or native changes may require a new EAS build and runtime/version, not just an OTA update. Build/release the compatible APK when required, then publish the appropriate OTA/release for that runtime; never ship native-dependent JS to an incompatible installed binary. Verify the published commit, channel, runtime and release link.

Do not stop after producing a plan or ask for approval after every stage. Make ordinary implementation decisions from the existing app and this brief. If a genuine blocker requires user input, explain it briefly and provide phone-friendly clickable choices. Final handoff: completed checklist, remaining verified blockers if any, tests performed, commit(s), release/build/update links and any installation step the user actually needs.
