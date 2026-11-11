// Web previews only: Google sign-in is native (Android/iOS).
export const connectGmail = async (): Promise<string | null> => null;
export const gmailTokenFor = (_email: string) => async (_expired?: string): Promise<string> => '';
export const needsReconnect = (_e: unknown): boolean => false;
export const getAccessToken = async (_expired?: string): Promise<string> => '';
export const chooseBackupAccount = async (): Promise<string | null> => null;
export const ensureDriveAccess = async (_interactive: boolean): Promise<boolean> => false;
