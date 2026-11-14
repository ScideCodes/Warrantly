// Web is only used for screen previews: no PDF rendering there.
import type { PdfPage } from './PdfPagesModule';

export type { PdfPage };
const none = (): Promise<never> => Promise.reject(new Error('Not available on the web'));
export default {
  render: async (_fileUri: string, _width: number): Promise<PdfPage[]> => [],
  thumbnail: (_fileUri: string, _width: number): Promise<PdfPage> => none(),
  renderForText: async (_fileUri: string, _width: number, _first: number, _count: number) => ({ pageCount: 0, pages: [] as string[] }),
  smallJpeg: (_fileUri: string, _size: number): Promise<string> => none(),
};
