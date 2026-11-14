import { NativeModule, requireNativeModule } from 'expo';

export interface PdfPage {
  uri: string; // file:// PNG in the cache folder
  width: number;
  height: number;
}

declare class PdfPagesModule extends NativeModule<Record<string, never>> {
  // Renders every page of a local PDF to an image `width` pixels wide.
  render(fileUri: string, width: number): Promise<PdfPage[]>;
  // The first page only, cached by file, width and change time. Rejects for a missing or unreadable PDF.
  thumbnail(fileUri: string, width: number): Promise<PdfPage>;
  // Up to `count` pages from `first` as JPEG files, for text recognition.
  renderForText(fileUri: string, width: number, first: number, count: number): Promise<{ pageCount: number; pages: string[] }>;
  // A square JPEG (base64) at most `size` pixels, for widgets.
  smallJpeg(fileUri: string, size: number): Promise<string>;
}

export default requireNativeModule<PdfPagesModule>('PdfPages');
