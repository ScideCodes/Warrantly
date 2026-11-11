import { useEffect } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// App updates (over the air, EAS Update). The app checks on start by itself; this also checks when it
// comes back from the background, because phones keep apps open for days. True once an update is
// downloaded and waiting: the home screen then offers to restart into it.
export function useUpdateReady(): boolean {
  const { isUpdatePending } = Updates.useUpdates();
  useEffect(() => {
    if (!Updates.isEnabled) return; // development and web
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      Updates.checkForUpdateAsync()
        .then((r) => (r.isAvailable ? Updates.fetchUpdateAsync() : undefined))
        .catch(() => {}); // offline: try again next time
    });
    return () => sub.remove();
  }, []);
  return isUpdatePending;
}

export const restartIntoUpdate = (): Promise<void> => Updates.reloadAsync();

// "0.7.0 · update a395e4b0 · Nov 11, 2026", or just the version for the build's own code.
export function versionLine(language: string): string {
  const version = Constants.expoConfig?.version ?? '?';
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.updateId) return version;
  const date = Updates.createdAt ? ` · ${Updates.createdAt.toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' })}` : '';
  return `${version} · update ${Updates.updateId.slice(0, 8)}${date}`;
}
