import { GoogleOneTapSignIn, isNoSavedCredentialFoundResponse, isSuccessResponse } from 'react-native-nitro-google-signin';

// Public identifier of the "Warrantly Web" OAuth client (not a secret). Credential Manager needs
// it on Android; the Android client (package + SHA-1) is matched by Google automatically.
const WEB_CLIENT_ID = '237650743703-o6i7era4merslmucakbqsqimsls1hg0a.apps.googleusercontent.com';
const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';

// Gmail scope here too, so getTokens() returns a token that can read mail.
GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID, scopes: [GMAIL_READONLY] });

const hasGmailScope = () => GoogleOneTapSignIn.getCurrentUser()?.scopes.includes(GMAIL_READONLY) ?? false;

// iOS (later): add the "react-native-nitro-google-signin" plugin to app.json with iosUrlScheme from an
// iOS OAuth client. Android needs no plugin: autolinking plus webClientId below is enough.

// shortcut: the library keeps one signed-in Google account. Multiple Gmail tabs (section 15)
// need per-account tokens; revisit in build step 7.

// Signs in, asks for read-only Gmail access, and returns the account email (null if cancelled).
export async function connectGmail(): Promise<string | null> {
  await GoogleOneTapSignIn.checkPlayServices();
  let res = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(res)) res = await GoogleOneTapSignIn.presentExplicitSignIn();
  if (!isSuccessResponse(res)) return null;
  if (!hasGmailScope()) await GoogleOneTapSignIn.requestScopes([GMAIL_READONLY]);
  return res.data!.user.email;
}

// Only counts as connected once Gmail read access is granted.
export const connectedEmail = (): string | null =>
  hasGmailScope() ? (GoogleOneTapSignIn.getCurrentUser()?.user.email ?? null) : null;

// Google access tokens live about an hour. Reuse one instead of asking the native layer before every
// request; after a 401 the provider passes the rejected token back and we fetch a fresh one.
let cached: { token: string; at: number } | null = null;
export async function getAccessToken(expired?: string): Promise<string> {
  if (expired) {
    await GoogleOneTapSignIn.clearCachedAccessToken(expired);
    cached = null;
  }
  if (!cached || Date.now() - cached.at > 45 * 60_000) {
    cached = { token: (await GoogleOneTapSignIn.getTokens()).accessToken, at: Date.now() };
  }
  return cached.token;
}
