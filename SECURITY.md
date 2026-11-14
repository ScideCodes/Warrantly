# Security

Warrantly keeps warranties, receipts and Gmail access on the phone, so security reports are welcome.

## Reporting a vulnerability

Please report it privately through GitHub: **Security › Report a vulnerability** on this repository. Do not open
a public issue for it. Include the app version (Settings › About), the steps to reproduce and what an attacker gains.

You get an answer within a week. A fix ships as an over-the-air update where possible, or in the next build.

## Scope

- The Android app in this repository and its encrypted backups.
- Out of scope: a phone that is already rooted or unlocked in someone else's hands, and Google's own services.

## How the app protects data

- No server: data stays in the app's private storage. Android app backup is off.
- Gmail access is read-only; tokens stay with Google Play services, never in the app's storage.
- Drive backups are encrypted on the phone (scrypt, AES-256-GCM) with the user's backup password.
- The optional app lock keeps a salted hash of the PIN in the Android Keystore, with growing waits after wrong tries.
- Mail content, shared files and Warrantly files from others are treated as untrusted: links from them open only web,
  mail and phone addresses, and nothing from them is run or rendered as HTML.
