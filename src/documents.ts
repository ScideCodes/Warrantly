import { Directory, File, Paths } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { extractTextFromImage } from 'expo-text-extractor';
import { Linking } from 'react-native';
import DocumentScanner, { ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import { mailtoUrl } from '@/claim';

// Documents kept with warranties (brainstorm section 18): scans become one PDF in the app's own folder.
const folder = () => {
  const dir = new Directory(Paths.document, 'attachments');
  if (!dir.exists) dir.create();
  return dir;
};
const fileFor = (localPath: string) => new File(folder(), localPath);

// Google's ML Kit scanner handles the camera, edges, cropping and several pages; ML Kit text recognition
// then reads the pages on the phone. Returns null if the user backs out.
export async function scanDocument(): Promise<{ text: string; localPath: string } | null> {
  const { status, scannedImages } = await DocumentScanner.scanDocument({ croppedImageQuality: 80 });
  if (status !== ScanDocumentResponseStatus.Success || !scannedImages?.length) return null;

  const text = (await Promise.all(scannedImages.map((uri) => extractTextFromImage(uri)))).map((lines) => lines.join('\n')).join('\n');

  // One A4 page per photo. Images are inlined: print HTML cannot load local files on every platform.
  const pages = scannedImages
    .map((uri) => `<div style="page-break-after:always;text-align:center"><img style="max-width:100%;max-height:100vh" src="data:image/jpeg;base64,${new File(uri).base64Sync()}"/></div>`)
    .join('');
  const { uri } = await Print.printToFileAsync({ html: `<html><body style="margin:0">${pages}</body></html>`, width: 595, height: 842 });
  const pdf = new File(uri);
  await pdf.move(folder());
  return { text, localPath: pdf.name };
}

// Downloaded mail PDFs (build step 4), stored next to scans. Returns the stored file name.
export const mailDocuments = {
  async save(bytes: Uint8Array, _filename: string): Promise<string> {
    const file = new File(folder(), `mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
    file.create();
    await file.write(bytes);
    return file.name;
  },
};

export const documentExists = (localPath: string): boolean => fileFor(localPath).exists;

export function deleteDocuments(localPaths: string[]): void {
  for (const p of localPaths) {
    const f = fileFor(p);
    if (f.exists) f.delete();
  }
}

// Android cannot open a private file:// link; the share sheet hands it to a PDF viewer.
export async function openDocument(localPath: string): Promise<void> {
  await Sharing.shareAsync(fileFor(localPath).uri, { mimeType: 'application/pdf' });
}

// Claim helper (section 20): the phone's mail composer with the document attached; plain mailto
// (no attachment) when no composer is set up.
export async function sendClaim(to: string, subject: string, body: string, localPaths: string[]): Promise<void> {
  if (await MailComposer.isAvailableAsync()) {
    await MailComposer.composeAsync({ recipients: [to], subject, body, attachments: localPaths.map((p) => fileFor(p).uri) });
  } else {
    await Linking.openURL(mailtoUrl(to, subject, body));
  }
}
