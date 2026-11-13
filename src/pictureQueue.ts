// Keep lookups serial (the image provider is rate limited), and check the setting
// between items so switching automatic pictures off stops the remaining work.
export async function processPictureQueue<T>(
  rows: T[],
  enabled: () => boolean,
  lookup: (row: T) => Promise<boolean>,
  onPicture: (row: T) => void,
): Promise<{ changed: number; error: unknown }> {
  let changed = 0;
  try {
    for (const row of rows) {
      if (!enabled()) break;
      if (await lookup(row)) { changed++; onPicture(row); }
    }
    return { changed, error: null };
  } catch (error) {
    // Preserve successes if the network drops partway through the library.
    return { changed, error };
  }
}
