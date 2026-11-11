import { GoogleOneTapSignIn, isNoSavedCredentialFoundResponse, isSuccessResponse } from 'react-native-nitro-google-signin';

// Public identifier of the "Warrantly Web" OAuth client (not a secret). Credential Manager needs
// it on Android; the Android client (package + SHA-1) is matched by Google automatically.
const WEB_CLIENT_ID = '237650743703-o6i7era4merslmucakbqsqimsls1hg0a.apps.googleusercontent.com';
const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';

GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID });

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
  await GoogleOneTapSignIn.requestScopes([GMAIL_READONLY]);
  return res.data!.user.email;
}

export const connectedEmail = (): string | null => GoogleOneTapSignIn.getCurrentUser()?.user.email ?? null;

export async function getAccessToken(): Promise<string> {
  return (await GoogleOneTapSignIn.getTokens()).accessToken;
}
