import { GoogleOneTapSignIn, isSuccessResponse } from 'react-native-nitro-google-signin';
import GoogleAccountToken from '../modules/google-account-token';
import { isGmailImportEnabled } from '@/features';
import { getSetting, setSetting } from '@/settings';

// Public identifier of the "Warrantly Web" OAuth client (not a secret). Credential Manager needs
// it on Android; the Android client (package + SHA-1) is matched by Google automatically.
const WEB_CLIENT_ID = '237650743703-o6i7era4merslmucakbqsqimsls1hg0a.apps.googleusercontent.com';
const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'; // backups: only files this app creates

// Gmail scope here too, so getTokens() returns a token that can read mail.
export function configureGoogleSignIn(): void {
  GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID, scopes: isGmailImportEnabled() ? [GMAIL_READONLY] : [] });
}
configureGoogleSignIn();

let playServicesChecked = false;
async function ensurePlayServices(): Promise<void> {
  if (playServicesChecked) return;
  await GoogleOneTapSignIn.checkPlayServices();
  playServicesChecked = true;
}

// iOS (later): add the "react-native-nitro-google-signin" plugin to app.json with iosUrlScheme from an
// iOS OAuth client. Android needs no plugin: autolinking plus webClientId below is enough.

// Connect a Gmail account (section 15: several are allowed). Google's account picker is always shown,
// so a second account can be chosen. Read-only Gmail access is always requested from Google: it shows the
// consent screen only when access is missing. (The saved session's scope list is what was asked for, not
// what was granted, so it cannot tell a revoked grant apart.) Returns the email, or null if cancelled.
export async function connectGmail(): Promise<string | null> {
  await ensurePlayServices();
  const res = await GoogleOneTapSignIn.presentExplicitSignIn();
  if (!isSuccessResponse(res)) return null;
  await GoogleOneTapSignIn.requestScopes([GMAIL_READONLY]);
  return res.data!.user.email;
}

// Gmail token for one specific account, without UI (native module; the sign-in library only covers its
// last signed-in user). Rejects with code CONSENT_REQUIRED when that account must be connected again.
export function gmailTokenFor(email: string): (expired?: string) => Promise<string> {
  let token: string | null = null;
  return async (expired) => {
    if (expired) {
      await GoogleOneTapSignIn.clearCachedAccessToken(expired);
      token = null;
    }
    token ??= await GoogleAccountToken.getToken(email, [GMAIL_READONLY]);
    return token;
  };
}

export const needsReconnect = (e: unknown): boolean => (e as { code?: string })?.code === 'CONSENT_REQUIRED';

let cached: { token: string; at: number } | null = null;

// Disconnect: take Warrantly off the account's "third-party access" list at Google. Revoking a token removes the
// whole grant, Drive included, so a backup on this account is turned off. Returns true in that case.
// Best effort: with no network or no grant left, the account is still disconnected on the phone.
export async function revokeGoogleAccess(email: string): Promise<boolean> {
  let token: string;
  try {
    token = await GoogleAccountToken.getToken(email, [GMAIL_READONLY]);
  } catch {
    return false; // already revoked, or never granted
  }
  try {
    await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(token)}` });
    await GoogleOneTapSignIn.clearCachedAccessToken(token).catch(() => {});
  } catch {
    return false;
  }
  if (getSetting('backup_account') !== email) return false;
  setSetting('backup_account', '');
  setSetting('backup_enabled', '0');
  cached = null;
  return true;
}

// Backups go to Google Drive (section 17). `interactive: false` (automatic backups) never shows a dialog.
// The account that granted Drive access is remembered: "the signed-in user" changes whenever another
// Gmail account is connected, and backups must keep going to the same Drive.
export async function ensureDriveAccess(interactive: boolean): Promise<boolean> {
  if (getSetting('backup_account')) return true;
  // With the person present, ask Google directly (the saved scope list can be stale; see connectGmail).
  if (interactive || !GoogleOneTapSignIn.getCurrentUser()?.scopes.includes(DRIVE_FILE)) {
    if (!interactive) return false;
    if (!GoogleOneTapSignIn.getCurrentUser()) {
      await ensurePlayServices();
      const res = await GoogleOneTapSignIn.presentExplicitSignIn();
      if (!isSuccessResponse(res)) return false;
    }
    const auth = await GoogleOneTapSignIn.requestScopes([DRIVE_FILE]);
    if (auth.accessToken) cached = { token: auth.accessToken, at: Date.now() };
    else cached = null;
  }
  const email = GoogleOneTapSignIn.getCurrentUser()?.user.email;
  if (email) setSetting('backup_account', email);
  return true;
}

// Google access tokens live about an hour. Reuse one instead of asking the native layer before every
// request; after a 401 the provider passes the rejected token back and we fetch a fresh one.
export async function getAccessToken(expired?: string): Promise<string> {
  if (expired) {
    await GoogleOneTapSignIn.clearCachedAccessToken(expired);
    cached = null;
  }
  if (!cached || Date.now() - cached.at > 45 * 60_000) {
    cached = { token: await driveToken(), at: Date.now() };
  }
  return cached.token;
}

// Pick the Google account whose Drive holds the backups (Google's account picker). Returns its email,
// or null if cancelled.
export async function chooseBackupAccount(): Promise<string | null> {
  await ensurePlayServices();
  const res = await GoogleOneTapSignIn.presentExplicitSignIn();
  if (!isSuccessResponse(res)) return null;
  const auth = await GoogleOneTapSignIn.requestScopes([DRIVE_FILE]); // shows consent only if missing (see connectGmail)
  if (auth.accessToken) cached = { token: auth.accessToken, at: Date.now() };
  else cached = null;
  const email = res.data!.user.email;
  if (!email) return null;
  setSetting('backup_account', email);
  return email;
}

// The backup account's token. Never another account's: a backup must not land in the wrong Drive.
async function driveToken(): Promise<string> {
  const account = getSetting('backup_account');
  if (account) return GoogleAccountToken.getToken(account, [DRIVE_FILE]);
  return (await GoogleOneTapSignIn.getTokens()).accessToken;
}
