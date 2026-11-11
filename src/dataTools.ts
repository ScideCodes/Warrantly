import { Directory, File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import Storage from 'expo-sqlite/kv-store';
import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import { deleteDriveBackups } from '@/backup';
import { clearLock } from '@/lock/store';
import { wipeDb, type Db } from '@/db/repo.ts';
import { updateWidget } from '@/widget';

// Export and "delete all my data" (GDPR: access and erasure).

async function share(file: File, mimeType: string): Promise<void> {
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: file.name });
}

export async function shareText(name: string, content: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await share(file, mimeType);
}

export async function sharePdf(name: string, html: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  await new File(uri).move(file);
  await share(file, 'application/pdf');
}

// Everything on this phone goes: warranties, documents, settings, PIN, backup key, reminders, Google
// sign-in. With `drive`, the backups in Google Drive are deleted first.
export async function deleteAllData(db: Db, drive: boolean): Promise<void> {
  if (drive) await deleteDriveBackups();
  await wipeDb(db);
  const docs = new Directory(Paths.document, 'attachments');
  if (docs.exists) docs.delete();
  Storage.clearSync();
  await clearLock();
  await SecureStore.deleteItemAsync('backup_key');
  await Notifications.cancelAllScheduledNotificationsAsync();
  await GoogleOneTapSignIn.signOut().catch(() => {});
  await updateWidget(db).catch(() => {});
}
