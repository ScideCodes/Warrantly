import { GoogleOneTapSignIn, isNoSavedCredentialFoundResponse, isSuccessResponse } from 'react-native-nitro-google-signin';
import GoogleAccountToken from '../modules/google-account-token';
import { getSetting, setSetting } from '@/settings';

// Public identifier of the "Warrantly Web" OAuth client (not a secret). Credential Manager needs
// it on Android; the Android client (package + SHA-1) is matched by Google automatically.
const WEB_CLIENT_ID = '237650743703-o6i7era4merslmucakbqsqimsls1hg0a.apps.googleusercontent.com';
const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'; // backups: only files this app creates

// Gmail scope here too, so getTokens() returns a token that can read mail.
GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID, scopes: [GMAIL_READONLY] });

const hasGmailScope = () => GoogleOneTapSignIn.getCurrentUser()?.scopes.includes(GMAIL_READONLY) ?? false;

// iOS (later): add the "react-native-nitro-google-signin" plugin to app.json with iosUrlScheme from an
// iOS OAuth client. Android needs no plugin: autolinking plus webClientId below is enough.

// Connect a Gmail account (section 15: several are allowed). Google's account picker is always shown,
// so a second account can be chosen; read-only Gmail access is asked once per account.
// Returns the email, or null if cancelled.
export async function connectGmail(): Promise<string | null> {
  await GoogleOneTapSignIn.checkPlayServices();
  const res = await GoogleOneTapSignIn.presentExplicitSignIn();
  if (!isSuccessResponse(res)) return null;
  if (!hasGmailScope()) await GoogleOneTapSignIn.requestScopes([GMAIL_READONLY]);
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

// Backups go to Google Drive (section 17). `interactive: false` (automatic backups) never shows a dialog.
// The account that granted Drive access is remembered: "the signed-in user" changes whenever another
// Gmail account is connected, and backups must keep going to the same Drive.
export async function ensureDriveAccess(interactive: boolean): Promise<boolean> {
  if (getSetting('backup_account')) return true;
  if (!GoogleOneTapSignIn.getCurrentUser()?.scopes.includes(DRIVE_FILE)) {
    if (!interactive) return false;
    if (!GoogleOneTapSignIn.getCurrentUser()) {
      await GoogleOneTapSignIn.checkPlayServices();
      let res = await GoogleOneTapSignIn.signIn();
      if (isNoSavedCredentialFoundResponse(res)) res = await GoogleOneTapSignIn.presentExplicitSignIn();
      if (!isSuccessResponse(res)) return false;
    }
    await GoogleOneTapSignIn.requestScopes([DRIVE_FILE]);
    cached = null; // the cached token was issued before Drive access was granted
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
  await GoogleOneTapSignIn.checkPlayServices();
  const res = await GoogleOneTapSignIn.presentExplicitSignIn();
  if (!isSuccessResponse(res)) return null;
  if (!GoogleOneTapSignIn.getCurrentUser()?.scopes.includes(DRIVE_FILE)) await GoogleOneTapSignIn.requestScopes([DRIVE_FILE]);
  const email = res.data!.user.email;
  if (!email) return null;
  setSetting('backup_account', email);
  cached = null;
  return email;
}

// The backup account's token. Never another account's: a backup must not land in the wrong Drive.
async function driveToken(): Promise<string> {
  const account = getSetting('backup_account');
  if (account) return GoogleAccountToken.getToken(account, [DRIVE_FILE]);
  return (await GoogleOneTapSignIn.getTokens()).accessToken;
}
