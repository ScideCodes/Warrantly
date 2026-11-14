export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export function bound(value: number, low: number, high: number): number {
  'worklet';
  return Math.max(low, Math.min(value, Math.max(low, high)));
}

export function maxPdfScroll(contentHeight: number, viewportHeight: number, scale: number): number {
  'worklet';
  return Math.max(0, contentHeight - viewportHeight / scale);
}

// Logical document point under the fingers stays under the moving focal point.
export function zoomPosition(oldScale: number, nextScale: number, x: number, y: number, focalX: number, focalY: number, width: number, height: number, contentHeight: number) {
  'worklet';
  const scale = bound(nextScale, MIN_ZOOM, MAX_ZOOM);
  return {
    scale,
    x: bound(focalX - ((focalX - x) / oldScale) * scale, width * (1 - scale), 0),
    y: bound(y + focalY / oldScale - focalY / scale, 0, maxPdfScroll(contentHeight, height, scale)),
  };
}
