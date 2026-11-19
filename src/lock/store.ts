import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { encodePin, lockoutSeconds, pinLength, pinMatches } from './pin.ts';

// App lock state in SecureStore (Keystore / Keychain). No PIN stored = lock off.
const PIN = 'lock_pin';
const BIOMETRIC = 'lock_biometric';
const FAILURES = 'lock_failures';
// Milliseconds of lockout still to wait. Replaces 'lock_wait_until' (a wall-clock deadline): never read that one as this.
const WAIT_LEFT = 'lock_wait_left';

export const isLockEnabled = (): boolean => SecureStore.getItem(PIN) !== null;

// The app restarts itself after some changes (an update, deleting everything). The user was just unlocked, so that one
// start skips the lock: a pass valid for 30 seconds, written only from inside the unlocked app.
const RELAUNCH = 'lock_relaunch_until';
export const allowRelaunchWithoutLock = (now = Date.now()): void => SecureStore.setItem(RELAUNCH, String(now + 30_000));
export function takeRelaunchPass(now = Date.now()): boolean {
  const until = Number(SecureStore.getItem(RELAUNCH) ?? 0);
  if (until) void SecureStore.deleteItemAsync(RELAUNCH);
  return until > now;
}
export const storedPinLength = (): number => pinLength(SecureStore.getItem(PIN) ?? '::');

export function setPin(pin: string): void {
  // The salt only has to differ between installs; it is not a secret.
  const salt = Date.now().toString(36) + Math.random().toString(36).slice(2);
  SecureStore.setItem(PIN, encodePin(pin, salt));
  resetFailures();
}

export async function clearLock(): Promise<void> {
  await Promise.all([PIN, BIOMETRIC, FAILURES, WAIT_LEFT].map((k) => SecureStore.deleteItemAsync(k)));
}

// The lockout counts down only while the app runs, on the monotonic clock (performance.now), so changing the
// phone's time does not end it. A closed app or a sleeping phone pauses it.
let lastTick: number | null = null;

// Seconds the user must still wait before another try (0 = may try now).
export function waitSeconds(at = performance.now()): number {
  const passed = lastTick === null ? 0 : Math.max(0, at - lastTick);
  lastTick = at;
  const left = Number(SecureStore.getItem(WAIT_LEFT) ?? 0);
  if (!(left > 0)) return 0;
  const next = Math.max(0, left - passed);
  if (next !== left) SecureStore.setItem(WAIT_LEFT, String(next));
  return Math.ceil(next / 1000);
}

export function checkPin(pin: string, at = performance.now()): boolean {
  if (waitSeconds(at) > 0) return false; // also moves lastTick to now, so a new wait starts in full
  if (pinMatches(pin, SecureStore.getItem(PIN) ?? '::')) {
    resetFailures();
    return true;
  }
  const failures = Number(SecureStore.getItem(FAILURES) ?? 0) + 1;
  SecureStore.setItem(FAILURES, String(failures));
  const wait = lockoutSeconds(failures);
  if (wait) SecureStore.setItem(WAIT_LEFT, String(wait * 1000));
  return false;
}

function resetFailures() {
  SecureStore.setItem(FAILURES, '0');
  SecureStore.setItem(WAIT_LEFT, '0');
}

// Fingerprint / face: only offered when the phone has it and it is set up (section 19). Strong (Class 3) only:
// a camera-based face unlock can be fooled by a photo.
export async function biometricAvailable(): Promise<boolean> {
  return (await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
}
export const isBiometricEnabled = (): boolean => SecureStore.getItem(BIOMETRIC) === '1';
export const setBiometricEnabled = (on: boolean): void => SecureStore.setItem(BIOMETRIC, on ? '1' : '0');

// Biometrics only; the PIN pad is the fallback, so the device passcode is not offered here.
// `error`: 'user_cancel' is the person or Android (Android 14 reports a prompt closed by focus loss the same way);
// 'system_cancel'/'app_cancel' are other closes by Android or a second prompt. `warning` is Android's message: the
// `cancel` label when "Use PIN" was tapped (see promptClosedBy).
export async function unlockWithBiometrics(prompt: string, cancel: string): Promise<{ success: boolean; error?: string; warning?: string }> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    cancelLabel: cancel,
    disableDeviceFallback: true,
    biometricsSecurityLevel: 'strong',
  });
  return res.success ? { success: true } : { success: false, error: res.error, warning: res.warning };
}

// "Forgot PIN": the phone's own screen lock (passcode, fingerprint or face) proves the owner.
export async function hasDeviceLock(): Promise<boolean> {
  return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
}
export async function verifyDeviceOwner(prompt: string): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
  return res.success;
}
