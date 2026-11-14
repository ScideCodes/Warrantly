export class IndexCancelled extends Error {}

// Android's native PDF text renderer reuses one cache folder. Keep each render + OCR
// sequence together so imports, indexing and page-count probes cannot delete each other's images.
let queue: Promise<unknown> = Promise.resolve();
export function withPdfText<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

// Consume each small native batch before rendering another: the renderer reuses its cache directory.
export async function readPdfText(
  render: (first: number, count: number) => Promise<{ pageCount: number; pages: string[] }>,
  recognize: (uri: string) => Promise<string[]>,
  cancelled: () => boolean,
): Promise<string> {
  return withPdfText(async () => {
    const parts: string[] = [];
    let first = 0;
    let total = Infinity;
    while (first < total) {
      if (cancelled()) throw new IndexCancelled();
      const batch = await render(first, 2);
      total = batch.pageCount;
      if (!batch.pages.length && first < total) throw new Error('Missing PDF pages');
      for (const uri of batch.pages) {
        if (cancelled()) throw new IndexCancelled();
        parts.push((await recognize(uri)).join('\n'));
      }
      first += batch.pages.length;
    }
    if (cancelled()) throw new IndexCancelled();
    return parts.join('\n');
  });
}
