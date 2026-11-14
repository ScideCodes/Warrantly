import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import type { PdfPage } from '../modules/pdf-pages';
import { toBase64 } from './backup/format';
import { privatePdfHtml, redactPng, type Mask } from './redaction';

export async function privatePdf(pages: PdfPage[], masks: Record<number, Mask[]>): Promise<string> {
  if (!pages.length || pages.length > 20) throw new Error('Use a document with 1–20 pages');
  const images: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    // Re-encode even unmarked pages: original text and metadata never travel with the copy.
    images.push(toBase64(redactPng(await new File(pages[i].uri).bytes(), masks[i] ?? [])));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const result = await Print.printToFileAsync({ html: privatePdfHtml(images), width: 595, height: 842 });
  return result.uri;
}
