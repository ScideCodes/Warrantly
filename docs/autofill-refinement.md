# Email and receipt autofill refinement

Applied the debugging and code-review skills to the actual shared-email → form and Gmail → parser paths. No dependencies or native APIs changed; public Gmail import remains disabled during Google's access review.

## Fixed

- Labeled purchase dates take precedence over a later email's sent date. Delivery confirmation keeps its own separate arrival date.
- Shared emails and receipts use the same date extractor. It validates calendar dates, supports full English/Hungarian month names, and excludes labeled payment deadlines and expiry dates.
- Multiplication-sign and ASCII quantity markers work before or after the product name.
- HTML table rows stay separate while ordinary wrapped product names still join. Warranty cells attach to the adjacent product in that row.
- A product's stated warranty no longer silently fills other products with unknown lengths. The first scanned product cannot inherit a later product's guarantee.
- Duplicate product mentions retain a known item-specific warranty instead of replacing it with an unknown length.

## Evidence and limits

Added regression cases that failed before the fixes, plus an integration test from a synthetic HTML .eml file through MIME decoding, mail-to-text and scan/form extraction. Existing anonymized real-store fixtures remain passing. These are deterministic local heuristics, not universal email understanding; unsupported layouts still need review. No private mailbox was accessed for this work.

All 159 tests pass; typecheck passes; lint has zero errors and one existing i18next warning. Full app UI flows were not rerun because this change is limited to pure parsing. Existing saved records are not rewritten.
