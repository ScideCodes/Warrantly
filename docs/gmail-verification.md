# Gmail import: verification package

Gmail import is built but off in 1.0 (`GMAIL_IMPORT` in `src/features.ts`). It uses
`https://www.googleapis.com/auth/gmail.readonly`, a restricted scope. Public use needs Google's restricted-scope
verification. While the switch is off, sign-in asks only for `drive.file` (backups).

Source: [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification),
read 14 Nov 2026.

## Status (14 Nov 2026)

Branding: verified and published. Data access: verification submitted, Google confirmed receipt, awaiting review
(not approved). Google estimates a first email in 3 to 5 days and the full review in 4 to 6 weeks. Contact:
scide.business@gmail.com.

## What Google asks for

| Item | Warrantly status |
|---|---|
| Public homepage that describes the app, links the privacy policy, on a domain you own (a Play listing does not count) | Done: https://bencepc.hu/warrantly/ (also Terms: https://bencepc.hu/warrantly/terms/). Source in ScideCodes/BencePC (`0d04fb3`, `d1026a3`). |
| Privacy policy on the same domain as the homepage, linked on the OAuth consent screen, following the User Data Policy and Limited Use | Done: https://bencepc.hu/warrantly/privacy/. Compliance may still be assessed during the review. |
| Domain ownership in Google Search Console, by an Owner/Editor of the Cloud project | Done: bencepc.hu verified in Search Console and added as an authorized domain. |
| Justification: how the scope is used and why a narrower one is not enough | Done: gmail.readonly use case and justification entered in the verification form. Draft kept below. |
| Unlisted YouTube demo video, in English | Done 14 Nov 2026: https://www.youtube.com/watch?v=J82HG2bCe4U (staging build, test account). Shows the OAuth clients and scopes, the unverified-app warning, Gmail and Drive consent, an imported test mail with its PDF. |
| Security assessment (CASA), yearly | Possibly not required. See "CASA" below. |

## Google's reply of 17 Nov 2026 (action needed)

Google asked for: a fuller justification of `gmail.readonly`, requested scopes that match the Data Access list
exactly, a new demo of every user-facing feature that uses the scope with the consent screen fully expanded, and
reviewer access with step-by-step instructions. Answer below; reply in the same email thread.

### Justification (sent with the reply)

Warrantly is an Android app that keeps a person's product warranties and receipts and reminds them before a warranty
or a return window ends. With `gmail.readonly` it builds that list from the user's own mailbox, so they do not have to
type in every purchase. Every feature below runs on the phone; there is no Warrantly server.

What the user sees, and the Gmail call behind it:

1. **Connect Gmail and choose how far back to look** (2 weeks to all mail). The app runs one search,
   `users.messages.list` with a `q` query that matches warranty, guarantee and invoice words in subjects and PDF
   names, purchase mails that state a warranty length, and return or cancellation mails, in English and Hungarian.
2. **Warranties appear automatically.** For each match the app reads the message, `users.messages.get` with
   `format=full`, and takes the store, product, purchase date, warranty length, order number and return deadline
   from the body.
3. **The warranty card or invoice PDF is kept with the warranty** and opens inside the app.
   `users.messages.attachments.get` downloads the PDF attachment.
4. **Needs your attention:** a mail with a missing detail (for example no product name) opens a form with the found
   values filled in and a **Show original email** button that shows the mail text.
5. **Ignored emails:** mails the user dismisses are remembered and can be restored.
6. **Scan older emails** later, **several Gmail accounts**, and a **new-mail check** each time the app opens (the same
   search, limited to mail after the last check).
7. **Disconnect** removes the account and stops all access.

Why narrower scopes do not work:

- `gmail.metadata` does not allow the `q` search parameter and cannot read message bodies or attachments. The
  warranty length, product, order number and the PDF are all in the body or the attachment.
- `gmail.labels`, `gmail.send`, `gmail.compose` and `gmail.insert` cannot read mail.
- `gmail.addons.current.message.readonly` works only inside a Gmail add-on for the message the user has open; it
  cannot search the mailbox and does not exist for Android apps.
- The app never sends, changes, labels, moves or deletes mail, so no write scope is requested.

Data use: mail is read on the phone and only the warranty records and the PDFs built from it are stored, on the phone.
They leave the phone only when the user turns on an encrypted backup to their own Google Drive (`drive.file`, files the
app created) or exports or shares them. Gmail data is not used for ads, not sold and not used to train models.

### Scopes the app requests (must match Data Access exactly)

| Scope | When |
|---|---|
| `https://www.googleapis.com/auth/gmail.readonly` | Connect Gmail |
| `https://www.googleapis.com/auth/drive.file` | Turn on Drive backup |
| `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` | Google sign-in, which shows the account picker |

### Reviewer access

Since 1.2.3 Gmail import is visible to everyone, so reviewers use the same build users install.

1. On an Android phone or emulator, install `Warrantly-1.1.0.apk` from
   https://github.com/ScideCodes/Warrantly/releases/tag/v1.1.0 and open it.
2. Type any name, tap Continue, then Later.
3. In Settings, under Email accounts, tap **Add Gmail account**, choose a Google account, accept the consent screen
   ("Advanced", then "Go to Warrantly", while the app is unverified).
4. Choose 1 month, tap Start. Go back to Warranties: found warranties appear there; mails with a missing detail
   under **Missing details**.
5. Open a warranty: the PDF from the mail is under Documents, tap View.

No Warrantly login exists; any Google account with a purchase or warranty mail works.

## Justification (first draft, 14 Nov)

Warrantly finds warranty documents and purchase mails that state a warranty length, and turns them into warranty
records on the user's phone. It must search the mailbox (`messages.list` with a query) and read matching messages and
their PDF attachments (`messages.get`, `attachments.get`). `gmail.metadata` cannot read bodies or attachments, and
the warranty length, product and order number are in the body or the PDF. `gmail.addons.*` scopes only work inside a
Gmail add-on, not in an Android app. The app never sends, deletes, labels or changes mail. Mail is read on the phone:
there is no Warrantly server. Records built from mail leave the device only when the user chooses: an encrypted
backup to their own Google Drive, or an export or share they start. Do not describe the whole app as device-only.

## Demo video script (about 3 minutes)

1. Show the app name and icon on the phone, then open Settings > Email accounts > Add Gmail account.
2. Google's account picker, then the consent screen. Pause on the app name "Warrantly" and the Gmail read-only line.
3. Show the OAuth client ID: open the same consent flow in a browser (or show the Cloud console client) so the
   client ID is visible, as Google asks.
4. Choose a sync range, let it run. Show the found warranties on home.
5. Open one: the store, dates, the warranty length taken from the mail, and the attached PDF opening in the app.
6. Show "Needs your attention" (a mail with a missing detail) and "Ignored emails".
7. Settings > Disconnect the account, and point to myaccount.google.com/permissions.

## CASA

Google's page says a security assessment is needed for an app that requests restricted data "and has the ability to
access data from or through a third-party server". Warrantly has no server: the token is fetched on the phone and the
phone calls the Gmail API directly. Google's help center elsewhere says restricted apps must be assessed every year,
with no qualifier, and forum questions about on-device apps are unanswered. So:

- Ask Google in writing, in the verification thread, whether CASA applies to a client-only app. Treat their answer as
  the rule.
- Back the claim with evidence a reviewer can check: the public repository, a list of every host the app can reach,
  and a network capture in the demo video showing traffic only to Google.
- Open risk: OTA updates can change the app's JavaScript after review. If Google raises it, turn off OTA for the
  Gmail-enabled channel or publish each OTA bundle hash in its GitHub release.

## Other ways to bring mail in (adhd run, 14 Nov 2026)

Five isolated idea branches (regulator, speedrunner, remove-the-assumption, logistics, 10-year-old), scored on
novelty, viability and fit, top three deepened.

| Path | Needs Google review | Verdict |
|---|---|---|
| Share an email into Warrantly (selected body text, a PDF attachment, or a `.eml` file) and run the existing parser | No | Built for 1.0 (`src/mail/rfc822.ts`, share filters `message/rfc822` and `text/plain`). PDFs already worked. Test on a real phone what Gmail's Android app can share; `.eml` may only come from Gmail web or other mail apps. Not yet tried on a real phone. |
| Verification as above, asking for the CASA exemption | Yes | Do it in parallel. It is the only path that keeps the built automatic import. |
| Apps Script in the user's own account writes found warranties to a Drive file the app created (`drive.file`) | No (for the app) | Power-user option only. Users see Google's "unverified app" screen for their own script, and the drive.file visibility of script-written files must be tested first. |
| Google Takeout `.mbox` of one label, imported on the phone | No | Good one-time backfill once the RFC 822 adapter exists. |
| Traps | | Bring-your-own OAuth client (too hard for most users, re-sign-in about every 7 days in Testing mode); WebView scraping of Gmail or Google purchases (breaks terms, fragile); NotificationListener (snippets only, no PDFs, Play policy friction); `gmail.metadata` (restricted too, cannot read bodies). |
