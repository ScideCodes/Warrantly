import { Linking } from 'react-native';
import { mailtoUrl } from '@/claim';

// Web is only used for screen previews: no camera scanner, OCR or files there.
export const scanDocument = async (): Promise<{ text: string; localPath: string } | null> => null;
export const deleteDocuments = (_localPaths: string[]): void => {};
export const openDocument = async (_localPath: string): Promise<void> => {};
export const sendClaim = async (to: string, subject: string, body: string, _localPaths: string[]): Promise<void> => {
  await Linking.openURL(mailtoUrl(to, subject, body));
};
