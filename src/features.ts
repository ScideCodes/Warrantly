// Gmail import is on for everyone. Until Google verifies the restricted gmail.readonly scope,
// users see the unverified-app screen and count toward the 100-user cap.

export function isGmailImportEnabled(): boolean {
  return true;
}

export function useGmailImport(): boolean {
  return true;
}
