# Gmail import: verification package

Gmail import is built but off in 1.0 (`GMAIL_IMPORT` in `src/features.ts`). It uses
`https://www.googleapis.com/auth/gmail.readonly`, a restricted scope. Public use needs Google's restricted-scope
verification. While the switch is off, sign-in asks only for `drive.file` (backups).

Source: [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification),
read 14 Nov 2026.

## What Google asks for

| Item | Warrantly status |
|---|---|
| Public homepage that describes the app, links the privacy policy, on a domain you own (a Play listing does not count) | To do. GitHub Pages works if its domain can be verified (next row). |
| Privacy policy on the same domain as the homepage, linked on the OAuth consent screen, following the User Data Policy and Limited Use | Text ready: `docs/privacy.md` (has the Limited Use sentence). Needs hosting. |
| Domain ownership in Google Search Console, by an Owner/Editor of the Cloud project | To do. Check that the chosen domain is accepted as an authorized domain. |
| Justification: how the scope is used and why a narrower one is not enough | Draft below. |
| Unlisted YouTube demo video, in English | Script below. |
| Security assessment (CASA), yearly | Possibly not required. See "CASA" below. |

## Justification (draft)

Warrantly finds warranty documents and purchase mails that state a warranty length, and turns them into warranty
records on the user's phone. It must search the mailbox (`messages.list` with a query) and read matching messages and
their PDF attachments (`messages.get`, `attachments.get`). `gmail.metadata` cannot read bodies or attachments, and
the warranty length, product and order number are in the body or the PDF. `gmail.addons.*` scopes only work inside a
Gmail add-on, not in an Android app. The app never sends, deletes, labels or changes mail. Mail is read on the phone
only: there is no Warrantly server, and no mail content leaves the device except to the user's own encrypted Drive
backup when they turn backups on.

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
