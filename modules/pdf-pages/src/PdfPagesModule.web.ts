// Web is only used for screen previews: no PDF rendering there.
import type { PdfPage } from './PdfPagesModule';

export type { PdfPage };
export default {
  render: async (_fileUri: string, _width: number): Promise<PdfPage[]> => [],
};
