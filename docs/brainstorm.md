# Warranty Tracker App: Brainstorm

> Working name (private development): **Warrantly**
> Public release name: to be chosen once the app works (Gardo is one candidate, not cleared, see section 22)
> Last updated: 2026-11-11
> Status: Brainstorming (no code yet)
> Purpose: When ready, hand this file to Claude Code to start the build.

---

## 1. Vision

A phone app (iOS + Android) that connects to the user's Gmail, finds purchase/warranty emails automatically, and keeps all warranties in one place: what was bought, where, when, and how many days of warranty are left.

**Principles**
- Everything stored locally on the device. No backend, no accounts of our own.
- Automatic where it can be, honest where it can't (asks the user instead of guessing).
- Free to build and run (no paid services).

---

## 2. Core Features

- Download the app, set a custom **username** (stored locally).
- **Connect a Gmail account** (OAuth, read-only).
- **Auto-sync** Gmail and collect warranty/purchase emails.
- For each warranty, show:
  - Product name
  - Purchase date and "how long ago"
  - Store
  - **Days left** on the warranty (color-coded)
  - Download/open the warranty document (PDF)
  - Store contact info and warranty/support website
- Local notifications before a warranty expires (optional, on by default, see section 16).
- **Multiple email accounts**, one tab per account. Gmail first, other providers later (section 15).
- Manual add/edit as the safety net, plus **scan a paper document** with the camera and turn it into an e-warranty (section 18).
- **App lock:** PIN, fingerprint, Face ID (section 19).
- Optional **auto backup** (section 17).
- **Claim helper:** pre-filled email to the store (section 20).
- **Search and filters** on the warranty list, and a **home-screen widget** (section 13).

---

## 3. Languages

- Hungarian and English required.
- **Final list (decided 2026-11-11), 19 language versions (18 languages, Chinese in two scripts):**
  - Your list: English, Hungarian, German, French, Spanish, Italian, Russian, Chinese, Japanese.
  - Added from 2025 app localization demand data (Alconost): Portuguese (Brazil), Korean, Dutch, Turkish.
  - Added for large user bases (my additions, not from that data): Polish, Ukrainian, Arabic, Hindi, Indonesian.
- Chinese: **both Simplified and Traditional** (decided).
- Arabic is right-to-left and needs extra layout work. Plan it as a later addition.
- **UI translation is cheap, email parsing is not.** Each language also needs its own keyword set for the parser (warranty, invoice and order words, date and number formats). Emails are parsed in the language they arrive in, whatever the app language is. **Rollout (decided): version one ships with English and Hungarian (interface and email parsing). The other languages are added one by one afterwards.**
- App follows the phone's language by default, with a manual override in Settings.
- Implementation: `i18next` + `expo-localization`, one JSON file per language.

---

## 4. Tech Stack (easiest, $0 path)

| Area | Choice |
|---|---|
| Framework | Expo (React Native + TypeScript), one codebase for iOS and Android |
| Local database | `expo-sqlite` |
| File storage | `expo-file-system` (PDFs in the app documents directory) |
| Gmail login | `expo-auth-session` (Google OAuth), Gmail REST API called directly |
| Backend | None |
| Parsing | Rules/regex only, no external AI (keeps everything local and free) |
| PDF text | `pdf.js` for digital PDFs (local) |
| Notifications | `expo-notifications` (local only) |
| Translations | `i18next` + `expo-localization` |
| App lock | `expo-local-authentication` (fingerprint / Face ID), `expo-secure-store` (PIN hash) |
| Claim email | `expo-mail-composer` |
| Document scan + OCR | Native scanner and on-device OCR library, TBD. Likely needs a development build, not Expo Go. |
| Backup | `expo-file-system` plus share sheet or Google Drive (`drive.file`), TBD |

---

## 5. Gmail Access: Key Constraints

- Reading mail needs the `gmail.readonly` scope, which Google treats as **restricted**.
- **During development (free):** use OAuth "Testing" mode, up to 100 test users, no review. Catch: sign-in expires about every 7 days.
- **Public release:** requires Google OAuth verification plus an annual third-party security assessment (CASA). This is the expensive step. Decide later.
- Being local-only helps the privacy story but does not exempt the app from verification.

---

## 6. Costs and Platform Notes

- **Android:** free to build and install as an APK on your own phone.
- **iOS:** Expo Go is free for development; installing real builds on an iPhone needs a Mac, and free-account builds expire after 7 days.
- **Public release (later decision):** Apple Developer $99/year, Google Play $25 one-time, plus Google Gmail verification.
- **Plan:** build and use the app (plus friends as test users) for $0 first. Publishing is a separate decision.

---

## 7. Sync Strategy

- Sync on app open, plus periodic background fetch (iOS decides timing, so it is not guaranteed).
- Only fetch emails newer than the last sync (store a `lastSyncedAt` / history marker).
- Gmail search query starting point:
  `warranty OR garancia OR receipt OR invoice OR számla OR "order confirmation" OR rendelés`
  (extend per language)
- Pull: sender, date, subject, body, attachments (PDFs).
- **First sync (per account):** after connecting, ask the user how far back to look: **2 weeks, 1 month, 3 months, 6 months, 12 months, 18 months, 24 months**, or **all emails**. **24 months is preselected**, because it matches the most common legal warranty length (section 8). Older emails can be scanned later from Settings.
- Each connected account keeps its own sync marker (see section 15).

---

## 8. Extraction Pipeline

**Order of checks for each email**
1. Is it a purchase/warranty email at all? (keywords, sender, attachments)
2. Extract from the **email body**: store (from sender/domain), purchase date (email date or date in text), product name, warranty length, order number, contact/website.
3. If something is missing, check the **PDF text** (`pdf.js`).
4. If still missing, put it in "Needs input".

**Required fields:** product name, purchase date, store, warranty length.
**Optional fields:** contact info, website, order number, serial number, notes.

**Warranty start date (decided)**
- The warranty starts when the customer **receives** the product, not when they order it.
- The start date defaults to the date of the invoice the app syncs (the user's invoice should come after receiving the product). The start date is **editable**.
- The purchase date is still stored and shown. The countdown uses the start date.
- Caution: some shops send the invoice at order or dispatch time, before delivery. So the start date is shown as suggested until the user confirms it. Proposed: if a delivery confirmation email is found, offer its date as the start date.

**Three outcomes (confidence-based)**
- **Complete:** all required fields found, saved silently, appears in the main list.
- **Needs input:** some required fields missing, goes to the "Needs your attention" inbox.
- **Ignored:** not a purchase email, hidden but reviewable and restorable.

**Rules**
- Never silently guess. A default (e.g. "24 months, EU standard") is shown as *suggested*, not confirmed.
- Scanned/image PDFs: no OCR in v1, treated as "Needs input".
- Remember choices: if the user sets a warranty length for a store once, offer it automatically next time for that store.
- **Default warranty length: 24 months** (decided), always shown as *suggested* until the user confirms. Basis: the EU minimum legal guarantee is 2 years from delivery (europa.eu). Hungary's mandatory warranty depends on price: 1 year for 10,000-100,000 HUF, 2 years for 100,000-250,000 HUF, 3 years above 250,000 HUF (2020 law-firm summary, rules may have changed, re-check before release).
- Emails are parsed in whatever language they arrive in (see section 3).
- **Store templates (decided, later improvement):** ready-made rules for the layout of emails from the biggest stores, starting with Hungary (for example eMAG, MediaMarkt, final list TBD). A matching store template is tried first, and the generic parser stays as the fallback for every other store. The rules ship inside the app and grow with app updates. Each template needs maintenance when a store changes its emails.

---

## 9. "Needs Your Attention" Screen

*(brainstormed 2026-11-11)*

**Entry point**
- A badge on the main screen ("3 need your attention"). Never a popup per email.
- Optional: a single local notification summarizing new items after a sync.

**List view**
- One card per item, showing what is already known (store, date, product if found).
- Missing fields shown as highlighted chips (e.g. "Warranty length missing").
- Sorted by most recent purchase first (older purchases may already be expiring, so consider an "urgent" flag for purchases where a default would already be nearly expired).

**Resolve view (one item)**
- Pre-filled form with the known fields; missing fields highlighted.
- **Source viewer:** toggle between the email body and the PDF, ideally side by side or in a bottom sheet, so the user can read the document while typing.
- **Quick-pick chips** for warranty length: 12 / 24 / 36 months / custom.
- Toggle: "Remember this for [store]".
- Actions: **Save**, **Not a warranty** (moves to Ignored), **Later** (leaves it in the inbox).

**Batch help**
- If several items share a store and the same missing field, offer "Apply to all N items from this store".
- Next/previous buttons to move through items quickly.

**Empty state**
- Friendly "All caught up" message.

**Open questions**
- Should items auto-expire from the inbox if never resolved?
**Decided: "Later" items nag**
- Tapping "Later" does not dismiss an item for good. It stays in the inbox.
- Every time the user reopens the app, a reminder shows while any item is still unresolved.
- One reminder for all pending items ("3 need your attention"), never one per item.
- Reminder is a **non-blocking banner** on the main screen. It stays visible and persistent but never blocks use of the app. Tapping it opens the inbox.
- Reason: a user who taps "Later" may forget otherwise.

---

## 10. Expired Warranties Tab

*(decided 2026-11-11)*

- Separate **Expired** tab next to the main warranty list.
- Warranties that are already expired when synced go straight into the Expired tab.
- When an active warranty reaches its end date, it **moves automatically** to the Expired tab (no user action).
- Expired items keep all their info and PDFs, so the user can still look up the invoice or contact info.
- Main list only shows active warranties.

- **Delete (decided):** the user can delete warranties from the Expired tab, with a confirmation first. Deleting also removes the stored PDFs.
- A deleted item that came from an email keeps a hidden marker (the Gmail message ID), so the next sync does not add it back.

**Open questions**
- Should the main list briefly show "just expired" items before they move, or move them the same day?

---

## 11. Dedupe Problem

*(initial thoughts, to be refined)*

One purchase often produces several emails: order confirmation, shipping notice, invoice, warranty card.

- **Primary key:** store + order number (when available).
- **Fallback match:** same store + similar date (within a few days) + similar product name.
- **Merge, don't duplicate:** one warranty record can have multiple source emails and multiple attachments.
- **Source priority:** invoice/receipt date wins for purchase date; any email with a warranty length fills that field.
- Edge cases: one email with multiple products (one record per product). Returns, cancellations and refunds are handled as below.

**Returns and refunds (decided)**
- When a return, cancellation or refund email arrives for a purchase, the app notifies the user and asks whether to delete that invoice/warranty.
- Matching uses the order number and store, falling back to store, date and product name.
- Proposed: the question appears as a card in the "Needs your attention" inbox (with the usual banner), with **Delete** and **Keep** actions. Nothing is deleted without the user's answer. If no matching warranty is found, the email is ignored.
- Return and refund keywords are needed per language, like the other parser keyword sets (section 3).

---

## 12. Draft Data Model

**accounts**
- `id`, `provider` (`gmail` | `outlook` | `imap`), `email`, `label`, `last_synced_at`, `sync_range_months` (null = all emails)

**warranties**
- `account_id` (null for manual entries unless assigned), `origin`: `gmail` | `manual` | `scan`
- `id`, `product_name`, `store_name`, `purchase_date`, `warranty_start_date` (default = invoice date, editable), `warranty_months`, `warranty_end_date` (can be derived), `order_number`
- `serial_number` (optional), `notes` (optional)
- `contact_email`, `contact_phone`, `website_url`
- `status`: `complete` | `needs_input` | `ignored`
- `missing_fields` (list), `length_is_suggested` (bool)
- `created_at`, `updated_at`

**sources**
- `id`, `warranty_id`, `gmail_message_id`, `received_at`, `subject`, `sender`

**attachments**
- `id`, `warranty_id`, `source_id`, `filename`, `local_path`

**store_rules**
- `store_name` (or domain), `default_warranty_months`

**settings**
- `username`, `language`, `reminders_enabled`, `backup_enabled`, `backup_interval`, `app_lock_method`

*Days left and "how long ago" are computed on the fly, never stored.*

---

## 13. Screens

- **Onboarding:** username + connect Gmail
- **Warranty list:** product, store, purchased X ago, days left (color-coded); sorted by soonest expiry
- **Detail:** purchase date, warranty start date, store, expiry, serial number, notes, contact info/website, open/download PDF, edit
- **Needs your attention:** see section 9
- **Expired tab:** separate tab for expired warranties, see section 10
- **Account tabs:** one tab per connected Gmail account, see section 15
- **Add / Scan:** manual form or camera document scan, see section 18
- **Claim helper:** button on the detail screen, see section 20
- **Lock screen:** PIN / fingerprint / Face ID, see section 19
- **Ignored emails:** review/restore
- **Settings:** username, language, accounts (add, remove, resync, scan older emails), reminders, backup, app lock

**Search and filter (decided)**
- Search bar on the warranty list: matches product name and store.
- Filters: account tab, store, days left (for example expiring within 30 days).
- Works in both the Active and Expired views.

**Home-screen widget (decided, later phase)**
- Shows the next warranty to expire and its days left.
- Tapping it opens that warranty.
- Privacy: with app lock on, a widget would show product names on the home screen without any unlock. Confirmed: a setting to hide product names on the widget (show only days left), hidden by default when app lock is on.
- Technical: widgets need native code on both platforms (iOS WidgetKit, Android app widget), outside Expo's normal JavaScript, so this likely needs extra setup beyond the development build. Verify when planned.

---

## 14. Build Order

1. Prototype Gmail fetch and parsing on 20-30 of your own real emails (riskiest part, so test first).
2. Expo project setup, translations, username screen.
3. Local DB, list and detail screens, days-left logic.
4. Attachment download and local storage.
5. "Needs your attention" flow, manual add/edit, store rules.
6. Dedupe, reminders (rolling schedule), app lock.
7. Multiple accounts (keep `account_id` and `provider` in the data model from step 3, and build the mail layer as a provider interface), backup.
8. Document scan + OCR, claim helper.
9. Search and filter, home-screen widget, store templates, other email providers (Outlook first).
10. Polish.
11. Decide on public release and Google verification.

---

## 15. Multiple Email Accounts and Providers

*(decided 2026-11-11)*

- The user can connect more than one Gmail account (for example work and personal).
- Each account gets its own tab, so the user can always tell which account a warranty was synced from.
- Sync marker, first-sync range, and "Needs your attention" items are tracked per account.
- Each account tab has Active and Expired views (section 10).
- The same purchase appearing in two accounts stays as two records. No cross-account dedupe.
- Manual and scanned entries: the user chooses where the app puts them when saving, either one of the connected account tabs or a general "Manual" tab.
- In Testing mode, every connected Google account must be listed as a test user.

**Disconnecting an account (decided)**
- Before disconnecting, the app makes a backup of that account's warranties and attachments, and tells the user.
- After disconnecting, that account's warranties are removed from the phone. Manual and scanned entries are not affected.
- When the same account is connected again, the app says a backup was made at [date and time] and offers to restore it.
- Details (confirmed 2026-11-11): the backup is an encrypted file stored on the phone (same encryption as section 17, so the user needs the backup password even if auto backup is off), and also uploaded if auto backup is on. Keep only the latest disconnect backup per account. Ask for confirmation before disconnecting.

**Other email providers (decided)**
- The app is not Gmail-only, because other people do not use Gmail. Version one supports Gmail. Outlook and other providers (for example Yahoo, or any mailbox through IMAP) come later.
- Build the mail layer as a provider interface (list new messages, read a message, download an attachment), so the parser and the rest of the app do not care which provider an email came from.
- Each account has a provider type and its own tab, like Gmail accounts.
- Technical notes (verify when planned): Outlook would use Microsoft's own OAuth and mail API with its own review rules, different from Google's. IMAP needs a TCP socket library in React Native and often an app password from the user. The Gmail-specific limits in section 5 do not apply to other providers.
- Outlook skipped for now (2026-11-11): registering the app with Microsoft needs an Azure account, which asks for card details. The app offers Gmail only. Outlook can be added later through the same provider interface.

---

## 16. Expiry Reminders

*(decided 2026-11-11)*

- Optional, **on by default**, toggle in Settings.
- Schedule per warranty: **90 days**, **60 days**, **30 days** before expiry, then **weekly** from 30 days until expiry, then a **prominent notification on the expiry day**.
- Tapping a reminder opens that warranty's detail screen.
- Reminders stop once a warranty is deleted.

**Technical notes**
- iOS allows only about 64 pending local notifications per app. With many warranties and weekly reminders this limit is easy to hit. Plan: schedule only the next few reminders per warranty (rolling window) and reschedule on every app open and after every sync.
- "Huge" day-of notification: use a high-priority channel on Android. On iOS, use the strongest interruption level available (time-sensitive may need an entitlement). Verify during build.

---

## 17. Backup

*(decided 2026-11-11)*

- Toggle in Settings.
- Auto backup interval: **weekly**, **monthly**, **every 3 months**, or **every 6 months**.
- Also a manual "Back up now" and a "Restore" action.
- Contents: database, stored PDFs, settings. Gmail sign-in is not included, the user reconnects after restoring.
- iOS background timing is not guaranteed, so a due backup also runs on app open when the interval has passed.

**Encryption (decided)**
- The backup file is encrypted on the phone before upload. Google Drive and iCloud only ever store an encrypted file.
- The user sets a **backup password** when turning backup on. It is needed to restore.
- Proposed design: key derived from the password with a salt (scrypt or PBKDF2), file encrypted with AES-256-GCM. Pick libraries during build (likely needs the development build).
- Scheduled auto backups must not ask for the password each time, so it is kept in the phone's secure storage (Keychain / Keystore). On a new phone the user types it once to restore.
- No server means no password recovery. If the password is lost, the backup cannot be opened. Show a clear warning when the password is set.

**Technical note**
- A backup that stays on the phone does not protect against a lost or broken phone, so there is no phone-only option.

**Destination (decided)**
- The user picks **Google Drive** or **iCloud** in Settings. Both are easy for the user to find.
- **Google Drive:** a visible folder created by the app (for example "Warranty Tracker Backups"), using the `drive.file` scope (access only to files the app creates, likely not a restricted scope, verify). Works on Android and iOS and can upload silently on schedule.
- **iCloud Drive (iOS):** visible in the Files app. Silent automatic saving to iCloud probably needs a native module (development build). Fallback: save through the share sheet to Files. Verify during build.

---

## 18. Manual Add and Document Scan

*(decided 2026-11-11)*

**Manual add**
- Form with the same fields as a warranty record.

**Scan flow**
1. User takes a picture of a paper document (receipt, invoice, warranty card).
2. App detects edges, crops, and converts it to a **PDF**.
3. On-device **OCR** reads the text.
4. Extraction finds product, store, purchase date, warranty length.
5. Same confidence pipeline as email (section 8): complete → saved; missing fields → "Needs your attention" with the scan shown next to the form.

**Details**
- Multi-page scans merge into one PDF.
- Import an existing photo or PDF from the gallery or files.
- When saving, the user chooses where the warranty goes: one of the connected account tabs or the "Manual" tab.

**Technical notes**
- On-device document scanning and OCR need native modules (ML Kit on Android, Apple Vision on iOS, via libraries). This likely means a custom development build instead of Expo Go. Verify libraries when building.
- OCR stays on device: free and keeps "everything local".
- OCR text is noisier than email text, so expect more "Needs input".
- The same OCR could later read scanned PDFs attached to emails (currently skipped in v1, section 8).

---

## 19. App Lock

*(decided 2026-11-11)*

- Offered during onboarding, toggle in Settings.
- **PIN:** always available. For users without biometrics, or who prefer a PIN.
- **Fingerprint:** offered on Android devices that support it and have a fingerprint enrolled.
- **Face ID:** offered on iOS devices that support it. Touch ID devices use fingerprint.
- The app checks hardware and enrollment, and only offers biometrics that work on that device.
- **Lock timing (decided):**
  - App closed (fully quit, or killed by the system): locked the next time it opens.
  - App only swiped away to the background (not quit): locked only if the user is away for more than **3 minutes**. Coming back within 3 minutes needs no unlock.
  - Technical: a closed app starts cold, so it always locks on start. For the background case, store the time the app went to the background and compare when it returns. The app cannot tell a user closing it from a system kill, so both lock.

**Technical notes**
- `expo-local-authentication` for biometrics, `expo-secure-store` for the PIN (store a hash, not the PIN).
- iOS needs a Face ID usage description in the app config.
- No account and no server means no remote PIN reset or email code.

**PIN recovery (decided)**
- The PIN is a gate to the app, not an encryption key. Data stays protected by the phone's own encryption and the app sandbox, so a forgotten PIN never destroys data.
- "Forgot PIN": the user proves identity with the phone's own screen lock (device passcode, fingerprint or Face ID through the OS prompt), then sets a new PIN. Anyone who can do that can already unlock the phone.
- If the phone has no screen lock at all: wipe app data and restore from backup.
- Wrong PIN attempts: the delay grows after 5 failures (for example 30 seconds, then longer).
- Rejected: security questions (weak) and email codes (need a server).

---

## 20. Claim Helper

*(decided 2026-11-11)*

- "Claim warranty" button on the detail screen.
- Opens an email draft to the store's contact email, pre-filled with product, purchase date, order number, warranty end date, and a spot for the user to describe the problem. The invoice/warranty PDF is attached.
- Uses the phone's mail composer (`expo-mail-composer`): no extra Gmail permission needed, the user reviews and sends from their own mail app.
- If the store only has a phone number or website, show those with a one-tap call or open.
- **Not available on expired warranties:** the button is hidden for items in the Expired tab.
- The draft is written in the **app language**.
- The serial number is included in the draft when the user has entered one.

---

## 21. Public Release Path

*(decided 2026-11-11)*

- Private for now, built so it can be released to the public later.
- Phases: personal use plus a few friends as Google test users (up to 100, sign-in expires about every 7 days), then public release.
- Public release needs: Google OAuth verification plus the annual third-party security assessment for the restricted Gmail scope (section 5), Apple Developer $99/year and Google Play $25 once (section 6), a privacy policy page, and the store privacy / data-safety forms.
- No server and local-only storage keeps the privacy answers simple. Gmail access still has to be disclosed.
- Keep "Gmail" and "Google" out of the app name to be safe (section 22).
- **Monetization:** the goal is a free app with no ads. How (or whether) to earn from it is discussed later. Local-only storage means no server costs, so the main running costs are store fees and the Gmail security assessment (section 5).

---

## 22. App Name

*(private development name: Warrantly, public name candidate: Gardo, not cleared)*

- **Decision (2026-11-11):** use **Warrantly** as the name during private development. The public name is decided later (Gardo is the candidate, trademark not cleared). Warrantly was not checked for trademarks, which is fine for private use but needs a check if it is ever published.
- Build notes for renaming later: keep the app name in one place (config and translation files) so a rename is cheap. The Android applicationId and the iOS bundle identifier cannot be changed after the first store release, so use a throwaway ID during development and choose the final one when preparing to publish.
- Direction: short, easy to say in many languages, hints at warranty or keeping receipts safe.
- Rules: no "Gmail" or "Google" in the name. Before choosing, check App Store, Google Play, domain and trademark availability.
- Ideas: Warrantly, Keepsure, Coverly, Receiptly, Garanta, Proofbox, Everkeep, Shieldly.
- Round 2 ideas (2026-11-11, none checked yet): Safio (safe), Tikko (clock tick, days counting down), Prova (proof, Romance-language root), Daylo (days left), Sikra (sure/safe echo in German, Italian, Swedish, Romanian), Kepto (keep), Valido (valid), Fixa (fix).
- Round 3 ideas (2026-11-11, user did not like round 2, wants a punchy brand like Venmo, PayPal, Zelle; none checked): Gardo (guard), Covo (cover), Lasto (it lasts), Warra (warranty, clipped), Mendo (mend, repair), Holdo (hold), Pruvo (proof), Zafe (safe with a Z, like Zelle).
- Pronunciation notes: names without L or R (Tikko, Kepto, Safio) are easiest for Japanese, Korean and Chinese speakers. Arabic has no P or V sound, so Prova and Kepto may be said as "Brova" and "Kebto". Tikko and Safio have none of L, R, P, V.
- Front-runner idea: **Garanta** (root word for "guarantee" in many European languages, easy to say).

**Garanta check (2026-11-11, quick web check, not a legal search)**
- Meaning: in Spanish and Portuguese a form of "garantir" (to guarantee), in Romanian the infinitive "a garanta". No negative or vulgar meaning found. The other languages on the list were not checked.
- Domains: garanta.com redirects to a GoDaddy for-sale page (price not checked). garanta.app is in use by a Spanish service that manages financial guarantees for construction companies (bonds, deposits, insurance mediation). garanta.hu could not be checked.
- Conflict risk: a business already uses the name Garanta in a related field (guarantees) in Spain. Real trademark risk for a public EU release.
- Similar app names exist, including a Turkish warranty tracking app titled "Garanti Takip".
- Not done: official trademark databases (EUIPO / TMview, WIPO, Hungarian office) and exact-name store searches.
- Status: **Garanta is not cleared.** Run an official trademark search before choosing it.

**Keepsure check (2026-11-11, quick web check, not a legal search)**
- Meaning: an English compound ("keep" + "sure"). Meaning in the other languages on the list was not checked.
- Domains: keepsure.com redirects to a domain broker's offer page (for sale, price not checked). keepsure.app could not be checked.
- Exact-name matches: no company or app named exactly "Keepsure" turned up in the searches.
- Close neighbours: an iOS app titled "KeepSecure", a key-control company called Keysure, and the security brands Keepsafe (photo vault, app lock) and Keeper Security (password manager). Risk: users may take it for a security or vault app, and these names could count as confusingly similar.
- Not done: official trademark databases (EUIPO / TMview, WIPO, Hungarian office) and exact-name store searches.
- Status: **Keepsure has no exact conflict found, but it is not cleared.** The similar names make a trademark search important.

**Gardo check (2026-11-11, quick web check, not a legal search)** *(user's favourite from round 3)*
- Meaning: no negative or vulgar meaning found. It appears only as a Galician verb form ("gardar"), Old Dutch "garden" and an Old Saxon variant. The other languages on the list were not checked.
- Trademark: GARDO is a live registered US mark owned by Chemetall GmbH (Germany) for chemicals, paints, cleaning products and lubricants (Nice classes 1-4, registered 2019, an international registration, territories not listed). A newer pending US application by Chemetall (see the third-party report block below) also covers classes 9 and 42. An older US GARDO mark for metal surface-treatment consulting was cancelled in 1995.
- Apps: no app named exactly "Gardo" turned up. Similar names exist: "Garda" apps (a focus timer, an alarm), and a "Guardo" trademark holder.
- Domains (checked by the user, 2026-11-11): **gardo.app is available.** gardo.com is taken and redirects to iphome.com.
- Not done: official trademark databases (EUIPO / TMview, WIPO, Hungarian office) and exact-name store searches.
- Status: **Gardo shows no clear conflict in software, but it is not cleared.**

**Gardo extended check (2026-11-11)**
- The official databases could not be searched from here: TMview blocked automated access and a trademark search page failed. This is **not** a clearance search.
- Other uses of the name found: "Lou Gardo" (a French restaurant app), "Comic Gardo" (コミックガルド, a Japanese manga app, only the title was seen), a "Guardo" trademark holder, and the Chemetall GARDO mark (chemicals). All are different fields from warranty tracking software. Japanese ガルド sounds like "Gardo", so watch it if the app is released in Japan.
- Hungary: no company or trademark named Gardo turned up (similar names only). The Hungarian trademark register was not searched directly.
- Manual searches to do before a public release (free): GARDO and sound-alikes (Guardo, Garda, Gardoo, Gardio) in EUIPO TMview (tmdn.org/tmview), WIPO Global Brand Database (branddb.wipo.int), USPTO trademark search, and the Hungarian SZTNH database. Look at class 9 (software), class 42 (software services) and class 36 (insurance and financial services, since "guarantee" can drift there).
- Register gardo.app early, and check the name in the App Store and Google Play when creating the listings.
- Keep "Gmail" and Google logos out of the name. Follow Google's branding rules for the sign-in button and the OAuth consent screen (re-check at verification).
- Consider a trademark attorney for the final check before a public launch.

**Third-party report (Gemini, pasted 2026-11-11) and what could be verified**
- The report rates GARDA critical, GUARDO high in class 9, GARDIO medium-high, GARDO medium, GARDOO low. Its main advice: classes 36, 9 and 42 are the danger zones. Keep software descriptions to business, transaction or productivity use, and away from security, monitoring, alarms and wearables. It gave no sources, so treat it as a list of leads.
- **Verified:** a pending US application for GARDO by Chemetall GmbH (serial 99552504, filed 2025-12-17, classes 1, 2, 3, 4, 9 and 42, first office action 2026-04-23). Class 9 covers computer programs for cleaning and painting processes, class 42 covers software design and SaaS. The report's claim of new class 9 GARDO filings is right, but the goods are industrial process software, not hardware tracking apps.
- **Verified in part:** GARDA marks owned by Garda World Security Corporation exist (classes 45 and 9 seen, class 36 and 42 rights not confirmed). A "Guardo" action camera brand by TE-Group exists. A pending GUARDO AI application by Mosyle (filed 2026-06-08, AI bot monitoring software, classes 9, 35, 42) exists. The US GARDIO application by Astellas was abandoned in 2025. A Swedish company called Gardio shows up in news about smart alarms, trademark not verified.
- **Not verified:** EU and WIPO registrations for any of these, the Gardio AB trademark, and the class 36 claims.
- My reading: for private use, trademark exposure is unlikely to matter. Before a public release the main risks are the identical pending GARDO application in classes 9 and 42, and the one-letter-different GARDA. This is not legal advice. Decide with a full TMview / WIPO search or a trademark attorney. Backup name to check if Gardo fails: Covo.

---

## 23. Open Questions

- Public app name: decided once the app works (section 22). Not needed for the build.
---

## Changelog

- **2026-11-11 (update 22):** Outlook skipped for now; the app offers Gmail only (15).
- **2026-11-11 (update 21):** Confirmed the development name as Warrantly. The public name will be chosen once the app works. Gardo stays only as a candidate.
- **2026-11-11 (update 20):** Warranty start date = delivery, defaulting to the invoice date, editable (8, 12). Returns and refunds notify the user and ask to delete (11). Serial number and notes fields (12, 13, 20). Other email providers supported later, mail layer as a provider interface (15). Version one ships English and Hungarian (3). Only open question left: the final app name.
- **2026-11-11 (update 19):** Store templates decided as a later improvement (8, build order). Confirmed disconnect backup details (15) and widget name hiding (13). Closed those open questions.
- **2026-11-11 (update 18):** Disconnect-account backup and restore prompt (15). Search and filter, home-screen widget (13, build order). Monetization: free, no ads, discuss later (21). Chinese in both scripts, 19 language versions (3). New open question on store templates.
- **2026-11-11 (update 17):** Private development name set to Warrantly. Gardo stays the public release candidate (not cleared). Added renaming build notes (22).
- **2026-11-11 (update 16):** Added Gemini's trademark report with verification (22). Found a pending identical GARDO application by Chemetall in classes 9 and 42 (US). Gardo stays the working name for private use, clearance needed before public release.
- **2026-11-11 (update 15):** Gardo set as the working name (header, section 22). Added extended trademark and conflict check with manual steps. Official databases could not be searched from here, so not cleared.
- **2026-11-11 (update 14):** Gardo domains: gardo.app available, gardo.com taken (redirects to iphome.com). Recorded in section 22.
- **2026-11-11 (update 13):** User likes "Gardo". Added quick check (22): no bad meaning, GARDO marked for chemicals by Chemetall (different field), domains unchecked. Not cleared.
- **2026-11-11 (update 12):** Round 2 name ideas rejected. Added round 3, punchy Venmo/Zelle-style names (22). None checked yet.
- **2026-11-11 (update 11):** Added round 2 of app name ideas with pronunciation notes (22). None checked yet.
- **2026-11-11 (update 10):** Added quick check of the name "Keepsure" (22). No exact match found, but several similar security-style names exist. Not cleared.
- **2026-11-11 (update 9):** Added quick check of the name "Garanta" (22). No bad meaning found, but garanta.app is used by an existing Spanish guarantee-management service. Not cleared.
- **2026-11-11 (update 8):** Final language list, 18 languages (3). Default warranty 24 months with EU/Hungary basis, preselected in first-sync picker (7, 8). Backup encryption with a user password (17). Delete from Expired tab with hidden marker (10). Lock timing: closed = lock now, background = 3 minutes (19). Claim helper hidden on expired items, draft in app language (20). Public release path (21) and app name ideas (22) added. Open Questions moved to section 23.
- **2026-11-11 (update 7):** PIN recovery confirmed (section 19). Closed that open question.
- **2026-11-11 (update 6):** Backup destination decided: Google Drive or iCloud (17). First-sync range picker: 2 weeks to 24 months or all (7). Scanned and manual entries: user picks the tab when saving (15, 18). Proposed PIN recovery via device screen lock (19).
- **2026-11-11 (update 5):** Added multiple Gmail accounts with tabs (15), expiry reminder schedule (16), backup (17), manual add and document scan with OCR (18), app lock (19), claim helper (20). First-sync prompt added to section 7. Data model, stack, screens and build order updated. Open Questions moved to section 21.
- **2026-11-11 (update 4):** Decided reminder style: non-blocking persistent banner on the main screen (section 9). Closed the reminder-style open question.
- **2026-11-11 (update 3):** Decided "Later" items nag on every app open until resolved (section 9). Added open question on reminder style. Fixed duplicate section numbering (now 1-15).
- **2026-11-11 (update 2):** Added Expired tab decision (section 10). Expired and just-expired warranties move automatically to a separate tab. Renumbered later sections.
- **2026-11-11:** Initial file. Added vision, features, languages, stack, Gmail constraints, costs, sync, extraction pipeline with confidence states, "Needs your attention" screen, dedupe notes, draft data model, screens, build order, open questions.
