// Whether the lock screen is showing right now. Screens opened by a link or shortcut under the lock (the
// "Scan receipt" shortcut) wait for the unlock before they open the camera.
let locked = false;
const waiting = new Set<() => void>();

export function setLockShowing(on: boolean): void {
  locked = on;
  if (!on) {
    waiting.forEach((resolve) => resolve());
    waiting.clear();
  }
}
export const whenUnlocked = (): Promise<void> => (locked ? new Promise((resolve) => waiting.add(resolve)) : Promise.resolve());
