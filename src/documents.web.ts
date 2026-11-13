import { Linking } from 'react-native';
import { mailtoUrl } from '@/claim';

// Web is only used for screen previews: no camera scanner, OCR or files there.
export const scanDocument = async (): Promise<{ text: string; localPath: string } | null> => null;
export const importDocument = async (): Promise<{ text: string; localPath: string } | null> => null;
export const fileToDocument = async (_uri: string, _name: string, _mimeType: string | null): Promise<{ text: string; localPath: string }> => ({ text: '', localPath: '' });
export const pickPhoto = async (_source: 'camera' | 'library'): Promise<string | null> => null;
export const saveFoundPicture = async (_url: string): Promise<string> => '';
export const mailDocuments = { save: async (_bytes: Uint8Array, _filename: string): Promise<string> => '' };
export const readDocument = async (_localPath: string): Promise<Uint8Array> => new Uint8Array();
export const writeDocument = async (_localPath: string, _bytes: Uint8Array): Promise<void> => {};
export const documentUri = (_localPath: string): string => '';
export const documentExists = (_localPath: string): boolean => false;
export const deleteDocuments = (_localPaths: string[]): void => {};
export const openDocument = async (_localPath: string): Promise<void> => {};
export const saveDocument = async (_localPath: string, _name: string): Promise<boolean> => false;
export const sendClaim = async (to: string, subject: string, body: string, _localPaths: string[]): Promise<void> => {
  await Linking.openURL(mailtoUrl(to, subject, body));
};
