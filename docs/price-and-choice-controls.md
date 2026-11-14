# Price and choice controls

Skills: Impeccable (polish), Unslop by Damir Sokolovsky (CC BY 4.0), Caveman and i-have-adhd for concise progress/reporting. Refinement of the existing iOS27 reference, not a new visual direction.

## Audit and direction

- Currency: free text could store typos; replace with a localized searchable picker.
- Price: unfiltered text and unclear unit; accept numeric amounts, show the unit, format on blur and use the same precision when saving.
- Length: missing short terms and an oversized Custom control; add 3/6 months and bound the custom field width.
- Category/coverage: inconsistent content-sized widths; use uniform pills within each group, adapt the whole group to larger fonts.

Product: a purchase and warranty archive. Character: calm, exact, familiar. World: the established receipt archive and pinned iOS27 materials. Moments: selected currency/checkmark and chosen coverage. Density: compact groups with readable, full-width controls when text grows.

## Currency data and behavior

- Offline snapshot of [SIX current ISO 4217 List One](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), published 2026-09-17 and fetched 2026-11-14. All 176 current codes are included, including monetary funds/metals; testing code XTS and no-currency code XXX are omitted. English/Hungarian names come from ICU/CLDR via Intl.DisplayNames; SIX names fill missing newer names. The existing receipt's historical code remains available too.
- Sorted by localized currency name, with code as tie-breaker. Search names or codes, accent-insensitively. Opening/closing without selection preserves the previous currency. No network or exchange-rate conversion.
- Canonical amount state uses digits and a decimal point. Editing uses the locale's separator; blur adds grouping and currency-specific decimal places. The selected ISO code stays outside the editable number, before or after it according to locale.
- Reject letters, negatives, exponent notation, invalid separators, oversized amounts and excess decimals; support localized grouped pasted numbers. JPY has zero decimals, KWD three, CLF four. Selecting a currency rounds the entered value to that currency's precision; it does not convert its value.
- New controls reuse the current Input, Row, SheetFrame, theme tokens and icon system. No dependencies or native modules added.

## Verification

- 175 tests pass. Typecheck passes. Lint has zero errors and the existing i18next warning. Regression cases cover localized sorting, historical codes, decimal precision, numeric filtering/paste parsing, formatting and saved-value consistency.
- Android developer emulator, Hungarian dark: inspected short length presets and equal-sized coverage/category controls. Selected 6 months, saved and reopened; its radio remains selected.
- Searched HUF, selected it with the keyboard open, entered 12345,67, attempted letters (rejected), blurred to 12 345,67 HUF, saved and reopened with the same amount/currency. Closing the picker without choosing leaves the selection intact.
- At 320dp/160% text: coverage/category groups become uniform full-width pills. Price/currency fields stack, the currency affix stays visible, and the searchable sheet fits above the keyboard. Selecting JPY rounds the test price to 12 346 with no decimals.
- Only synthetic records used. Recent ReactNativeJS/AndroidRuntime error logs are empty. No actual mailbox or Drive backup changed.
