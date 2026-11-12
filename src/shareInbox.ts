// A file shared into Warrantly from another app (Gmail, Files, Gallery), waiting for the add form.
// Kept here, not in the route, so a link can never point the form at some other file of the app.
export interface SharedFile {
  uri: string;
  name: string;
  mimeType: string | null;
}

let pending: SharedFile | null = null;
export const putSharedFile = (f: SharedFile): void => void (pending = f);
export function takeSharedFile(): SharedFile | null {
  const f = pending;
  pending = null;
  return f;
}
