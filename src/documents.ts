import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { extractTextFromImage } from 'expo-text-extractor';
import { Linking } from 'react-native';
import DocumentScanner, { ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import { mailtoUrl } from '@/claim';
import { isWikimediaFile, WIKIMEDIA_HEADERS } from '@/productImage';
import { saveDocumentCopy } from './documentSave';

// Documents kept with warranties (brainstorm section 18): scans become one PDF in the app's own folder.
const folder = () => {
  const dir = new Directory(Paths.document, 'attachments');
  if (!dir.exists) dir.create();
  return dir;
};
// Stored names are plain file names. The viewer gets its name from a route parameter, which a link can
// set, so anything path-like is refused: it must not reach other files of the app.
const fileFor = (localPath: string) => {
  if (!/^[\w.-]+$/.test(localPath) || localPath.includes('..')) throw new Error('Not a document');
  return new File(folder(), localPath);
};

// Google's ML Kit scanner handles the camera, edges, cropping and several pages; ML Kit text recognition
// then reads the pages on the phone. Returns null if the user backs out.
export async function scanDocument(): Promise<{ text: string; localPath: string } | null> {
  const { status, scannedImages } = await DocumentScanner.scanDocument({ croppedImageQuality: 80 });
  if (status !== ScanDocumentResponseStatus.Success || !scannedImages?.length) return null;
  return imagesToPdf(scannedImages.map((uri) => ({ uri, mimeType: 'image/jpeg' })));
}

// A photo or PDF already on the phone (gallery, Downloads, Drive). Photos go through the same OCR and PDF
// step as scans; a PDF is kept as it is and fills nothing in (text = ''). Returns null if the user backs out.
export async function importDocument(): Promise<{ text: string; localPath: string } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets.length) return null;
  const { uri, name, mimeType } = picked.assets[0];
  return fileToDocument(uri, name, mimeType ?? null);
}

// A photo or PDF file (picked, or shared into Warrantly from another app) as a stored document.
export async function fileToDocument(uri: string, name: string, mimeType: string | null): Promise<{ text: string; localPath: string }> {
  if (mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    const pdf = new File(folder(), `import-${Date.now()}.pdf`);
    await new File(uri).copy(pdf);
    return { text: '', localPath: pdf.name };
  }
  return imagesToPdf([{ uri, mimeType: mimeType ?? 'image/jpeg' }]);
}

async function imagesToPdf(images: { uri: string; mimeType: string }[]): Promise<{ text: string; localPath: string }> {
  const text = (await Promise.all(images.map(({ uri }) => extractTextFromImage(uri)))).map((lines) => lines.join('\n')).join('\n');

  // One A4 page per photo. Images are inlined: print HTML cannot load local files on every platform.
  const pages = images
    .map(({ uri, mimeType }) => `<div style="page-break-after:always;text-align:center"><img style="max-width:100%;max-height:100vh" src="data:${mimeType};base64,${new File(uri).base64Sync()}"/></div>`)
    .join('');
  const { uri } = await Print.printToFileAsync({ html: `<html><body style="margin:0">${pages}</body></html>`, width: 595, height: 842 });
  const pdf = new File(uri);
  await pdf.move(folder());
  return { text, localPath: pdf.name };
}

// Product photo (section 13): camera or gallery, cropped square, stored next to the documents.
// Returns the stored file name, or null if the user backs out.
export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.7 };
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return null;
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets.length) return null;
  const photo = new File(folder(), `photo-${Date.now()}.jpg`);
  await new File(res.assets[0].uri).copy(photo);
  return photo.name;
}

// A product picture found online (src/productImageLookup.ts): a small Commons thumbnail kept with the photos,
// so it shows offline. Returns the stored file name.
export async function saveFoundPicture(url: string): Promise<string> {
  if (!isWikimediaFile(url)) throw new Error('Unexpected picture address');
  const file = new File(folder(), `found-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  const saved = await File.downloadFileAsync(url, file, { headers: WIKIMEDIA_HEADERS });
  if (saved.size > 2_000_000) {
    saved.delete();
    throw new Error('Picture too large');
  }
  return saved.name;
}

export const documentUriOrNull = (localPath: string | null): string | null => (localPath && documentExists(localPath) ? fileFor(localPath).uri : null);

// Downloaded mail PDFs (build step 4), stored next to scans. Returns the stored file name.
export const mailDocuments = {
  async save(bytes: Uint8Array, _filename: string): Promise<string> {
    const file = new File(folder(), `mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
    file.create();
    await file.write(bytes);
    return file.name;
  },
};

// For backups (section 17): documents travel as their own encrypted files.
export const readDocument = (localPath: string): Promise<Uint8Array> => fileFor(localPath).bytes();
export async function writeDocument(localPath: string, bytes: Uint8Array): Promise<void> {
  const file = fileFor(localPath);
  if (!file.exists) file.create();
  await file.write(bytes);
}

export const documentExists = (localPath: string): boolean => fileFor(localPath).exists;
export const documentUri = (localPath: string): string => fileFor(localPath).uri;

export function deleteDocuments(localPaths: string[]): void {
  for (const p of localPaths) {
    const f = fileFor(p);
    if (f.exists) f.delete();
  }
}

// Save a copy where the person chooses (Downloads, a Drive folder...): Android's folder picker, then a new
// file in that folder. Returns false if they back out of the picker; throws if writing fails.
export async function saveDocument(localPath: string, name: string): Promise<boolean> {
  const source = fileFor(localPath);
  if (!source.exists) throw new Error('missing');
  return saveDocumentCopy(() => source.bytes(), () => Directory.pickDirectoryAsync(), name);
}

// Android cannot open a private file:// link; the share sheet hands it to a PDF viewer or another app.
export async function openDocument(localPath: string): Promise<void> {
  await Sharing.shareAsync(fileFor(localPath).uri, { mimeType: 'application/pdf' });
}

// Claim helper (section 20): the phone's mail composer with the document attached; plain mailto
// (no attachment) when no composer is set up.
// `to` may be empty (feedback before an address is set): the user fills it in.
export async function sendClaim(to: string, subject: string, body: string, localPaths: string[]): Promise<void> {
  if (await MailComposer.isAvailableAsync()) {
    await MailComposer.composeAsync({ recipients: to ? [to] : [], subject, body, attachments: localPaths.map((p) => fileFor(p).uri) });
  } else {
    await Linking.openURL(mailtoUrl(to, subject, body));
  }
}
