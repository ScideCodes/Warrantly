# Shortlist implementation checklist

> Independent review: see [shortlist-review.md](shortlist-review.md). The table below records
> Claude's implementation claims; it is not certification that all 30 brief requirements or emulator flows
> passed. Items 8, 14, 18, 20, 25, 26, 27 and 30 have remaining gaps recorded in that review.

Brief: `docs/CLAUDE_SHORTLIST_IMPLEMENTATION_PROMPT.md`. Status: `todo`, `wip`, `done` (implemented and tested as
stated), `blocked` (with the verified reason). Emulator checks are not physical-device measurements.

## Existing behaviour found before the work (13 Nov 2026)

| Area | Evidence | Used for |
|---|---|---|
| App icon shortcuts "Add warranty", "Scan receipt" | `plugins/withShortcuts.js`, `edit.tsx` `scan=1` | 21 |
| Share into Warrantly (one file, in memory only) | `_layout.tsx` `SharedFiles`, `shareInbox.ts` | 16 (replaced by a persisted inbox) |
| Repair and claim notes (dated text) | `history` table, detail "History" | 6 (kept as notes; claims added beside them) |
| Other covers of one purchase (same product, store, day) | `otherCovers()` | 17 (bundles generalise it) |
| Household share file with documents | `shareWarranties`, `importShared` | 18 (transfer builds on it) |
| Return window (14 days, mail purchases) | `returnDeadline()` | 25 |
| Widget privacy default (names hidden while locked) | `widgetShowsNames()` | 30 |
| Encrypted Drive backup, last time and error | `backup/index.ts`, settings keys | 20 |
| Personal photos only, category icon fallback | `photo.ts`, `legacyPictures.ts` | 26 |

## Checklist

Unit = Node tests (`npm test`). Emulator column is filled in from the test log below.

| ID | Requirement | Where | Status | Verification |
|---|---|---|---|---|
| D | Compact / Comfortable density | `settings.ts`, Settings › General, `WarrantyRow` | done | tsc, lint; emulator |
| S | Light / Dark / System; language "System" / "Rendszer" | `en.json`, `hu.json` (stored value stays `system`) | done | i18n key check |
| 1 | Home summary (covered, expiring ≤30 d, no document), each count a filter | `listView.summary`, home `SummaryItem` | done | unit `shortlist.test.ts` |
| 2 | Row document button: one document opens, several open a picker, none or missing offers add/restore | `WarrantyRow`, `DocumentSheet` | done | tsc; emulator |
| 3 | Sort (ends soonest, added, price per currency, name) + quick filters | `listView.ts`, filter sheet | done | unit |
| 4 | Favorites pinned in their own section | migration 13 `favorite`, detail star, home | done | unit `splitPinned` |
| 5 | Bulk select: save documents to a folder, category, collection, archive, with Undo | home select mode | done | unit (archive, categories); emulator |
| 6 | Claims Submitted → In repair → Resolved | `claims` table, detail | done | unit |
| 7 | Collections (room, person, purpose), filter, bulk add | `collections*` tables, `/collections` | done | unit |
| 8 | Document text search, read on the phone, batched, cancel/retry | `docIndex.ts`, `doc_text`, home + `/documents` | done | unit (index invalidation, escaped LIKE) |
| 9 | Undo for deletes, document removal, category and archive | soft delete + `undo.ts`, `UndoHost` | done | unit (undo, shared file retention, purge) |
| 10 | Duplicate review, merge, "not the same" | `duplicates.ts`, `mergeWarranties`, `/duplicates` | done | unit (pairs, merge refuses different covers) |
| 11 | Serial scanner: barcode, label text fallback, confirm/edit, typing, denied camera | `/scan-serial`, `serial.ts`, `expo-camera` | done | unit (`serial.test.ts`); emulator |
| 12 | Custom reminders (sent even with automatic ones off) | `custom_reminders`, `reminderPlan`, detail | done | unit (reconciliation) |
| 13 | Document labels, change from detail | `attachments.label` | done | unit |
| 14 | PDF thumbnails (native, cached by name/width/mtime) | `modules/pdf-pages` `thumbnail`, `DocThumb` | done | native build; emulator |
| 15 | Completeness check with fixes | `completeness.ts`, detail | done | unit |
| 16 | Persisted document inbox (share intents), assign/new/discard, dedupe | `inbox` table, `_layout`, `/inbox`, edit `inbox=` | done | unit (dedupe); emulator |
| 17 | Bundles (bought together), share a document between them | `bundles`, detail | done | unit (bundle merge/dissolve) |
| 18 | Transfer: choose fields and files, Warrantly file or summary PDF, honest note | `transfer.ts`, `/transfer` | done | unit (`transfer.test.ts` privacy) |
| 19 | Documents view: search, type filter, open/save/share, index progress | `/documents` | done | tsc; emulator |
| 20 | Backup health: off, failed, never, overdue, pending, ok; retry; home row | `backupHealth.ts`, `/backup-status` | done | unit (`backupHealth.test.ts`) |
| 21 | "Scan receipt" shortcut waits for the unlock before the camera | `lock/gate.ts`, `edit.tsx` | done | emulator |
| 22 | Recently opened (phone only, clearable) | `recent.ts`, home, Settings | done | unit |
| 23 | Widget sizes (small/medium/large, font scale aware) | `widgetModel.widgetSize`, `widget.tsx` | done | unit; emulator |
| 24 | Widget quick actions (scan, add, search) | `widget.tsx` deep links | done | emulator |
| 25 | Widget return deadlines | `widgetRows` `returns` | done | unit |
| 26 | Widget product photos (own photos only, small JPEG) | `photoForWidget`, `smallJpeg` | done | unit (privacy); emulator |
| 27 | Per-widget configuration | `widgetConfigScreen.tsx`, `widgetFeatures` | done | emulator |
| 28 | Widget attention count | `widget.tsx` badge | done | emulator |
| 29 | Widget follows app theme (System → light/dark variants) | `renderFor` | done | emulator |
| 30 | Widget privacy per widget | `namesShown`, config | done | unit |

## Decisions

- Deletes are soft (`deleted_at`) for the 7 s undo window; the next start finishes any window the app was closed in.
  Files are deleted only when no document, photo or inbox item uses them any more.
- Backup health uses trigger-kept change counters (`meta`) and the set of documents already on Drive, so "pending" is
  exact rather than a guess from timestamps. Overdue means twice the chosen interval has passed.
- The text index is keyed by file, so a receipt shared between bundle items is read once.
- Duplicates need strong evidence (same order or serial number) or the same name plus the same store or dates
  ≤14 days apart; different covers and bundle members are never suggested.
- Price sort groups by currency; no conversion.
- Custom reminders are sent even when automatic reminders are off: the person set them on purpose.
- Transfer drops left-out fields from the file instead of blanking them. Documents are sent unchanged; the screen says
  so rather than promising redaction.
- The row's document button with no document opens the detail with the add sheet already open (one sheet, one
  choice), instead of starting the scanner straight from a list row.
- Widget label and description in `app.json` are fixed strings (the widget library takes one string, not
  translated resources); the widget's own texts follow the app language.
- Widget preview image in the launcher picker is the existing one (not regenerated in this change).

## Release compatibility

Native changes (camera module, `pdf-pages` Kotlin, widget provider `widgetFeatures` and configuration activity)
mean the existing 0.8.x APK cannot run this JavaScript. Version bumped to 0.9.0 (runtime `appVersion`), new EAS
preview build, then the matching OTA and GitHub release with the APK attached.

## Test log

- 13 Nov 2026: `npm test` 136 pass, 0 fail (repo, features migration 12→13, old/new backup restore, shortlist,
  backup health, transfer privacy, serial, widget model). `npx tsc --noEmit` clean. `npx expo lint` 0 errors.
- 14 Nov 2026 (1.0.0): Gmail import switched off, app ID `dev.warrantly.app`. `npm test` 146 pass, 0 fail.
  `npx tsc --noEmit` clean. `npx expo lint` 0 errors (1 existing warning in `src/i18n/index.ts`).
