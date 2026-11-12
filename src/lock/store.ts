import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { encodePin, lockoutSeconds, pinLength, pinMatches } from './pin.ts';

// App lock state in SecureStore (Keystore / Keychain). No PIN stored = lock off.
const PIN = 'lock_pin';
const BIOMETRIC = 'lock_biometric';
const FAILURES = 'lock_failures';
const WAIT_UNTIL = 'lock_wait_until';

export const isLockEnabled = (): boolean => SecureStore.getItem(PIN) !== null;

// The app restarts itself after some changes (theme, update). The user was just unlocked, so that one
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
  await Promise.all([PIN, BIOMETRIC, FAILURES, WAIT_UNTIL].map((k) => SecureStore.deleteItemAsync(k)));
}

// Seconds the user must still wait before another try (0 = may try now).
export function waitSeconds(now = Date.now()): number {
  return Math.max(0, Math.ceil((Number(SecureStore.getItem(WAIT_UNTIL) ?? 0) - now) / 1000));
}

export function checkPin(pin: string, now = Date.now()): boolean {
  if (waitSeconds(now) > 0) return false;
  if (pinMatches(pin, SecureStore.getItem(PIN) ?? '::')) {
    resetFailures();
    return true;
  }
  const failures = Number(SecureStore.getItem(FAILURES) ?? 0) + 1;
  SecureStore.setItem(FAILURES, String(failures));
  const wait = lockoutSeconds(failures);
  if (wait) SecureStore.setItem(WAIT_UNTIL, String(now + wait * 1000));
  return false;
}

function resetFailures() {
  SecureStore.setItem(FAILURES, '0');
  SecureStore.setItem(WAIT_UNTIL, '0');
}

// Fingerprint / face: only offered when the phone has it and it is set up (section 19).
export async function biometricAvailable(): Promise<boolean> {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}
export const isBiometricEnabled = (): boolean => SecureStore.getItem(BIOMETRIC) === '1';
export const setBiometricEnabled = (on: boolean): void => SecureStore.setItem(BIOMETRIC, on ? '1' : '0');

// Biometrics only; the PIN pad is the fallback, so the device passcode is not offered here.
// `error` says who closed the prompt: 'user_cancel' is the person, 'system_cancel'/'app_cancel' is Android.
export async function unlockWithBiometrics(prompt: string, cancel: string): Promise<{ success: boolean; error?: string }> {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: cancel, disableDeviceFallback: true });
  return res.success ? { success: true } : { success: false, error: res.error };
}

// "Forgot PIN": the phone's own screen lock (passcode, fingerprint or face) proves the owner.
export async function hasDeviceLock(): Promise<boolean> {
  return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
}
export async function verifyDeviceOwner(prompt: string): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
  return res.success;
}
