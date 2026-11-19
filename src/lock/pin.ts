// Pure PIN helpers (brainstorm section 19). The PIN is a gate, not an encryption key: the hash lives in
// SecureStore (Keystore / Keychain), so this only keeps the plain PIN out of storage.

// SHA-256 (FIPS 180-4), because no native crypto module is in the build. Input is UTF-8 text.
const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(text: string): string {
  const data = new TextEncoder().encode(text);
  const bitLen = data.length * 8;
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i] + v) >>> 0));
  }
  return Array.from(h, (v) => v.toString(16).padStart(8, '0')).join('');
}

export const MIN_PIN = 4;
export const MAX_PIN = 6;

// Stored as "salt:length:hash". The length lets the lock screen check as soon as enough digits are in.
export function encodePin(pin: string, salt: string): string {
  return `${salt}:${pin.length}:${sha256(`${salt}:${pin}`)}`;
}

export function pinMatches(pin: string, stored: string): boolean {
  const [salt, length, hash] = stored.split(':');
  return pin.length === Number(length) && sha256(`${salt}:${pin}`) === hash;
}

export const pinLength = (stored: string): number => Number(stored.split(':')[1]);

// Section 19: the wait grows after 5 wrong PINs: 30 s, then doubling, at most an hour.
export function lockoutSeconds(failures: number): number {
  return failures < 5 ? 0 : Math.min(30 * 2 ** (failures - 5), 3600);
}

// Section 19: back from the background after more than 3 minutes locks again.
export const RELOCK_AFTER_MS = 3 * 60_000;
// Both clocks: the monotonic one (performance.now) cannot be set back, but it may pause while the phone sleeps; the
// wall clock keeps counting in sleep but can be changed. Either one past 3 minutes, or going backwards, locks.
export type Stamp = { wall: number; mono: number };
export const stampNow = (): Stamp => ({ wall: Date.now(), mono: performance.now() });
export function shouldRelock(hidden: Stamp | null, now: Stamp): boolean {
  if (!hidden) return false;
  const wall = now.wall - hidden.wall;
  const mono = now.mono - hidden.mono;
  return wall < 0 || mono < 0 || wall > RELOCK_AFTER_MS || mono > RELOCK_AFTER_MS;
}

// The one start without the lock after the app restarts itself. The pass holds a wall-clock deadline, so a pass
// further ahead than it was ever written (the phone's clock set back) is refused too.
export const RELAUNCH_PASS_MS = 30_000;
export const relaunchPassValid = (until: number, now: number): boolean => until > now && until - now <= RELAUNCH_PASS_MS;

// Who closed the fingerprint prompt that opened by itself. Android 15/16 closes it as USER_CANCEL when the app stops
// being the top task, on CLOSE_SYSTEM_DIALOGS or on device lock (AOSP AuthController.closeDialog); Android 14 when the
// window focus moves. expo-local-authentication reports all of these as 'user_cancel', the same as Back. Only "Use PIN"
// says who it was: androidx passes the button's label as the message. A close sooner than a person can react to the
// prompt is the system. (A close by leaving the app is followed by AppState 'background'; the lock screen checks that.)
export const QUICK_CANCEL_MS = 500;
const PERSON_ANSWERS = ['user_fallback', 'lockout', 'not_enrolled', 'not_available', 'passcode_not_set'];
export function promptClosedBy(res: { error?: string; warning?: string }, cancelLabel: string, openMs: number): 'person' | 'system' {
  if (!res.error || PERSON_ANSWERS.includes(res.error)) return 'person';
  if (res.error !== 'user_cancel') return 'system'; // 'system_cancel', 'app_cancel' (a prompt still closing), 'unknown'
  if (res.warning === cancelLabel) return 'person';
  return openMs < QUICK_CANCEL_MS ? 'system' : 'person';
}
