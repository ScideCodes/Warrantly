import { useSyncExternalStore } from 'react';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { isLockEnabled } from './store';

// Whether the lock screen is showing right now. Screens opened by a link or shortcut under the lock (the
// "Scan receipt" shortcut) wait for the unlock before they open the camera.
let locked = false;
const waiting = new Set<() => void>();
const watchers = new Set<() => void>();

export function setLockShowing(on: boolean): void {
  if (on === locked) return;
  locked = on;
  if (!on) {
    waiting.forEach((resolve) => resolve());
    waiting.clear();
  }
  watchers.forEach((w) => w());
}
export const isLocked = (): boolean => locked;
export const whenUnlocked = (): Promise<void> => (locked ? new Promise((resolve) => waiting.add(resolve)) : Promise.resolve());

// Sheets and dialogs are Modals, their own Android windows above the in-window lock screen: they hide while it shows.
const subscribe = (w: () => void) => (watchers.add(w), () => void watchers.delete(w));
export const useLocked = (): boolean => useSyncExternalStore(subscribe, () => locked);

// FLAG_SECURE while the lock is on: screenshots, recordings and the recent-apps preview stay blank.
export const syncScreenCapture = (): Promise<void> => (isLockEnabled() ? preventScreenCaptureAsync() : allowScreenCaptureAsync()).catch(() => {});
