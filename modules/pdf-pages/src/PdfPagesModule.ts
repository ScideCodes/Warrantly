import { NativeModule, requireNativeModule } from 'expo';

export interface PdfPage {
  uri: string; // file:// PNG in the cache folder
  width: number;
  height: number;
}

declare class PdfPagesModule extends NativeModule<Record<string, never>> {
  // Renders every page of a local PDF to an image `width` pixels wide.
  render(fileUri: string, width: number): Promise<PdfPage[]>;
}

export default requireNativeModule<PdfPagesModule>('PdfPages');
