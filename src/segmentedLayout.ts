// Reserve full labels at the current text scale, including padding. Reflow whole options instead of
// breaking words or shrinking text. `measured` is the widest label as laid out (dp, bold, at this scale);
// until it is known, a letter-count estimate with a font-metric allowance stands in.
export function segmentedLayout(width: number, fontScale: number, labels: string[], large = false, measured?: number) {
  const count = Math.max(1, labels.length);
  const padding = large ? 8 : 12;
  const textWidth = measured !== undefined ? Math.ceil(measured) + 2 : Math.max(0, ...labels.map((s) => s.length * 13 * 0.65)) * fontScale + 8;
  const cellWidth = (columns: number) => (width - 4 - 4 * (columns - 1)) / columns;
  let columns = count;
  if (width > 0) {
    while (columns > 1 && cellWidth(columns) < textWidth + padding * 2) columns--;
    // Balanced rows: four choices become 2x2, not a row of three plus one orphan.
    while (columns > 1 && count % columns !== 0) columns--;
  }
  return { columns, optionWidth: width > 0 ? cellWidth(columns) : undefined,
    icons: width > 0 && cellWidth(columns) >= textWidth + padding * 2 + 23 };
}
