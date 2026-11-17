// How many pills per row: the most that fit (up to 4) while every row stays full, so a group never ends
// with a lonely pill under a fuller row. One column when nothing else fits.
export function pillColumns(count: number, width: number, pillWidth: number, gap: number): number {
  for (let c = Math.min(4, count); c > 1; c--) {
    if (count % c !== 0) continue;
    if ((width - gap * (c - 1)) / c >= pillWidth) return c;
  }
  return 1;
}
