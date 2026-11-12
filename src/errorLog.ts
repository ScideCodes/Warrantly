import Storage from 'expo-sqlite/kv-store';

// Crash and error log (section 13), kept on the phone only. Nothing is sent anywhere: the user can attach
// it to a feedback mail. The newest 20 entries are kept.
const KEY = 'error_log';
const KEEP = 20;

export function logError(e: unknown, where = ''): void {
  try {
    const message = e instanceof Error ? `${e.name}: ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}` : String(e);
    const log: string[] = JSON.parse(Storage.getItemSync(KEY) ?? '[]');
    Storage.setItemSync(KEY, JSON.stringify([`${new Date().toISOString()} ${where} ${message}`.trim(), ...log].slice(0, KEEP)));
  } catch {
    // the log must never cause a second error
  }
}

export const readErrorLog = (): string[] => JSON.parse(Storage.getItemSync(KEY) ?? '[]');
export const clearErrorLog = (): void => void Storage.removeItemSync(KEY);

// Errors nothing else caught: logged, then handled as before (a crash still shows as one).
export function installErrorLog(): void {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } };
  const previous = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((e, fatal) => {
    logError(e, fatal ? 'fatal' : 'uncaught');
    previous?.(e, fatal);
  });
}
