# Import review and private sharing

Implemented using the debugging/code-review skills and Impeccable's existing mobile Operate guidance. The pinned iOS27 materials, typography and shared controls remain the visual reference.

## Five requested improvements

1. **Source previews:** shop, purchase date, product name and warranty length have a Source text action during import review. It shows an actual excerpt, or the source text when the normalized value cannot be found literally. The original receipt can also be opened. No invented confidence percentages.
2. **Multiple products:** shared email/text/receipts open Review import from the inbox. A fresh scan/import from an empty add form also stages its file in the inbox before review. Choose products, edit names and each warranty length, or add a missed product. Selected products save together, share one receipt file and form a purchase bundle. Existing manually entered form data is preserved by retaining the single-record attach flow when that form already contains a product/shop/order.
3. **Remember corrections:** explicit opt-in stores confirmed product names and lengths locally, keyed by the same detected shop and product. Later imports label remembered corrections for review. A shop's corrections can be forgotten without clearing the current form. Nothing is uploaded; these convenience mappings are not included in backups. Delete-all-data already clears the underlying local store.
4. **Review missing/uncertain values:** imported values remain suggestions until Save. Missing product, shop, date or valid 1–120 month length blocks saving; no automatic 24-month substitute. Imported PDFs can be read with local OCR before review. Unknown or unreadable details remain editable rather than being silently invented.
5. **Private sharing:** a shield action in the PDF viewer and a Redact and share action beside transfer documents open the private-copy editor. Draw areas or enter percentage coordinates, undo, create a separate preview, visit every page and confirm before opening the share chooser. It shares a private PDF separately; it does not silently change documents selected for a Warrantly transfer file.

## Data and failure handling

- Batch import, attachments, bundle creation and inbox consumption use one transaction. A failure rolls back every record and keeps the inbox entry. Save is guarded against double taps.
- Scans are persisted before navigating to review; closing review leaves them in the inbox.
- Background indexing, foreground import OCR and private-copy page-count probes serialize use of Android's shared PDF text-rendering cache. Foreground PDF import cancels background indexing before waiting.
- Redaction renders page images, overwrites the selected pixels in JavaScript and re-encodes fresh PNGs without original metadata. The generated PDF contains those images only, rather than recoverable original images/text under black overlay annotations.
- The original PDF is never changed. Copies are rasterized and lose selectable text; users must check all pages and all personal details themselves. Import OCR/private-copy processing is limited to 20-page documents. Preview validates that output page count matches the original; mismatch blocks sharing.
- One new pure-JavaScript dependency, MIT-licensed `fast-png` 8, installed through `expo install`, avoids a native module change and allows an OTA on runtime 1.0.0. Its graph adds `fflate` and `iobuffer`; the dependency audit reported no finding for these packages. Existing audit findings elsewhere were not changed by this task.
- Gmail import remains hidden while Google's restricted-access review is pending. The new flow is available for shared email/text, scans, images and PDFs without Gmail account access.

## Verification

- 169 tests pass, including multi-product extraction, correction scoping, selected-only save, all-or-nothing rollback, duplicate submission refusal, pixel/alpha replacement, metadata removal and concurrent PDF reader serialization.
- Typecheck passes. Lint has zero errors and one pre-existing i18next warning. English/Hungarian new-key sets match.
- Android developer emulator: reviewed normal and 320dp/160% Hungarian layouts; source sheet opens with the real text; edited a product name, enabled remembering, saved two records with separate lengths and one shared document/bundle; a later import applied the saved correction.
- Tested local OCR from a PDF with no stored text. The test exposed missing product-line boundaries; fixed with regression coverage, then confirmed both detected products in the review screen.
- Drew a redaction on a synthetic two-page PDF, generated and inspected the actual PDF preview, visited page two, confirmed and opened the share chooser, then cancelled without sending. Creation took about 10 seconds on the test emulator.
- Independent PDF inspection found two image-only output pages and no original selectable text. The original receipt hash remained identical; pixel tests establish that masked regions are overwritten, not just covered.
- No private mailbox, real receipt, real backup, external message recipient or iPhone was used in these checks. iOS distribution/porting requirements are documented separately in [ios-distribution.md](ios-distribution.md).
