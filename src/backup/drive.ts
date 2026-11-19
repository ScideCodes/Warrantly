// Google Drive storage for backups, with the drive.file scope: the app only sees files it created.
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
export const FOLDER_NAME = 'Warrantly Backups';
export const KEEP = 5;

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
}

export function driveClient(getToken: () => Promise<string>, fetchFn: typeof fetch = fetch) {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await getToken()}` } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let reason = text.slice(0, 160);
      try {
        const err = JSON.parse(text).error;
        reason = [err?.errors?.[0]?.reason ?? err?.status, err?.message].filter(Boolean).join(' - ');
      } catch {}
      throw new Error(`Drive ${res.status}${reason && `: ${reason}`}`);
    }
    return res;
  }
  const q = (query: string) => encodeURIComponent(query);
  let cachedFolderId: string | null = null;

  async function folderId(): Promise<string> {
    if (cachedFolderId) return cachedFolderId;
    const found = await (await call(`${API}/files?q=${q(`name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)}&fields=files(id)`)).json();
    if (found.files?.length && typeof found.files[0].id === 'string') {
      const id = found.files[0].id;
      cachedFolderId = id;
      return id;
    }
    const created = await call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    cachedFolderId = (await created.json()).id;
    return cachedFolderId!;
  }

  // shortcut: one page of 1000 files (5 backups + one file per document); page through when a user can have more.
  async function list(): Promise<DriveFile[]> {
    const parent = await folderId();
    const res = await call(`${API}/files?q=${q(`'${parent}' in parents and trashed = false`)}&orderBy=createdTime desc&pageSize=1000&fields=files(id,name,createdTime)`);
    return (await res.json()).files ?? [];
  }

  async function upload(name: string, text: string): Promise<string> {
    const boundary = `warrantly${Date.now()}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, parents: [await folderId()], mimeType: 'application/json' }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
    const res = await call(UPLOAD, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return (await res.json()).id;
  }

  const download = async (id: string): Promise<string> => (await call(`${API}/files/${id}?alt=media`)).text();
  const remove = async (id: string): Promise<void> => void (await call(`${API}/files/${id}`, { method: 'DELETE' }));

  return { list, upload, download, remove };
}

export const BACKUP_PREFIX = 'warrantly-backup-';

// Upload a new backup and keep only the newest few backups. Document files in the folder are left alone.
export async function uploadAndPrune(drive: ReturnType<typeof driveClient>, name: string, text: string): Promise<void> {
  await drive.upload(name, text);
  // Best effort: the new backup is safe on Drive; old ones are pruned again next time.
  await (async () => {
    const backups = (await drive.list()).filter((f) => f.name.startsWith(BACKUP_PREFIX));
    for (const old of backups.slice(KEEP)) await drive.remove(old.id);
  })().catch(() => {});
}
