// The photo a warranty shows: the person's own photo while its file exists and has not failed to load, otherwise
// null (the category icon in lists, the camera tile on the detail screen). Never a blank tile.
export function shownPhoto(path: string | null, exists: (path: string) => boolean, failed: string | null): string | null {
  return path && path !== failed && exists(path) ? path : null;
}
