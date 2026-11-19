import { Pressable, Text, View } from '@/components/themeMotion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { AppState, BackHandler, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { PinLayout, PinPad } from '@/components/PinPad';
import { checkPin, hasDeviceLock, isBiometricEnabled, storedPinLength, unlockWithBiometrics, verifyDeviceOwner, waitSeconds } from '@/lock/store';
import { promptClosedBy } from '@/lock/pin.ts';
import { logError } from '@/errorLog';
import { showAlert } from '@/components/Dialog';
import { colors, CONTROL_H, TYPE, themed } from '@/theme';

// Android 14 closes the fingerprint prompt when it loses window focus, and reports that as 'user_cancel', the same as
// the person pressing Back. Our own window takes focus at the end of a launch or return animation, so the prompt
// waits until the window has it. A focus gained before JS listened (process start) is never reported: no blur seen
// counts as focused.
let windowFocused = true;
if (Platform.OS === 'android') {
  AppState.addEventListener('focus', () => (windowFocused = true));
  AppState.addEventListener('blur', () => (windowFocused = false));
}

// Full-screen lock over the app (section 19). The app stays mounted underneath, so unlocking keeps your place.
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [wait, setWait] = useState(waitSeconds);
  const [shake, setShake] = useState(0);
  const insets = useSafeAreaInsets();
  const length = storedPinLength();

  const tryBiometrics = useCallback(async () => {
    if ((await unlockWithBiometrics(t('lock.biometricPrompt'), t('lock.usePin'))).success) onUnlock();
  }, [onUnlock, t]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true); // no navigating behind the lock
    return () => sub.remove();
  }, []);

  // Ask for the fingerprint by itself when the lock shows, and again on each return to the front while it shows.
  // Android closes a prompt opened while it is still bringing the app to the front (splash screen, window focus), or
  // when the app leaves the front, so wait until the app is in front and keep trying while the system (not the
  // person) closes it. "Use PIN" or cancel stay the person's answer until the next return; a lockout until unlock.
  // Runs once per lock: `t` changes when the language loads at startup, and a second prompt would cancel the first.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  useEffect(() => {
    if (!isBiometricEnabled()) return;
    type Run = { alive: boolean; stop?: () => void };
    let run: Run = { alive: true };
    let away = false;
    let lockedOut = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const ready = () => AppState.currentState === 'active' && windowFocused;
    // A cancelled run calls `stop`, so its listeners never outlive it; the loop then sees `alive` false and returns.
    const inFront = (me: Run) =>
      new Promise<void>((resolve) => {
        if (ready()) return resolve();
        const done = () => (subs.forEach((s) => s.remove()), (me.stop = undefined), resolve());
        const check = () => ready() && done();
        const subs = [AppState.addEventListener('change', check), ...(Platform.OS === 'android' ? [AppState.addEventListener('focus', check)] : [])];
        me.stop = done;
      });
    const DELAYS = [300, 700, 1200, 2000];
    const ask = async (me: Run) => {
      for (let attempt = 0; attempt < DELAYS.length && me.alive; attempt++) {
        await inFront(me);
        await sleep(DELAYS[attempt]);
        if (!me.alive) return;
        const usePin = tRef.current('lock.usePin');
        const opened = Date.now();
        const res = await unlockWithBiometrics(tRef.current('lock.biometricPrompt'), usePin);
        const openMs = Date.now() - opened;
        if (res.success) return onUnlock();
        // Home, device lock or another app on top close the prompt as 'user_cancel' and then send 'background',
        // which ends this run. Timers pause in the background, so this wait sees that event.
        if (res.error === 'user_cancel') await sleep(400);
        if (!me.alive) return;
        if (res.error === 'lockout') lockedOut = true;
        if (promptClosedBy(res, usePin, openMs) === 'person') return;
        const note = `fingerprint prompt closed by Android (${res.error}), attempt ${attempt + 1}`;
        logError(note, 'lock');
        console.warn('lock', note);
      }
    };
    void ask(run);
    // Only a real return counts: iOS goes 'inactive' and back while Face ID shows.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        run.alive = false;
        run.stop?.();
        away = true;
      } else if (state === 'active' && away) {
        away = false;
        if (!lockedOut) void ask((run = { alive: true }));
      }
    });
    return () => {
      run.alive = false;
      run.stop?.();
      sub.remove();
    };
  }, [onUnlock]);

  useEffect(() => {
    if (!wait) return;
    const timer = setInterval(() => setWait(waitSeconds()), 1000);
    return () => clearInterval(timer);
  }, [wait]);

  function onDigit(d: string) {
    if (wait) return;
    if (wrong) setWrong(false);
    const next = pin + d;
    if (next.length < length) return setPin(next);
    if (checkPin(next)) return onUnlock();
    setPin('');
    setWrong(true);
    setShake((n) => n + 1);
    setWait(waitSeconds());
  }

  async function forgot() {
    if (!(await hasDeviceLock())) return showAlert(t('lock.noDeviceLock'));
    if (await verifyDeviceOwner(t('lock.forgotPrompt'))) {
      onUnlock();
      router.push('/pin');
    }
  }

  return (
    <View style={styles.screen}>
      <PinLayout
        icon="shield-checkmark"
        title={t('lock.title')}
        message={wait > 0 ? t('lock.wait', { count: wait }) : wrong ? t('lock.wrong') : t('lock.hint')}
        error={wrong || wait > 0}
        top={insets.top}
        pad={
          <PinPad
            value={pin}
            dots={length}
            onDigit={onDigit}
            onDelete={() => setPin((p) => p.slice(0, -1))}
            disabled={wait > 0}
            shake={shake}
            extra={isBiometricEnabled() ? { icon: 'finger-print', label: t('lock.biometric'), onPress: () => void tryBiometrics() } : undefined}
          />
        }
        footer={
          <Pressable style={styles.link} onPress={forgot} accessibilityRole="button" hitSlop={4}>
            <Text style={styles.linkText}>{t('lock.forgot')}</Text>
          </Pressable>
        }
      />
    </View>
  );
}

const useStyles = themed(() => StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, zIndex: 10 },
  // Text button in the reference's link colour, 44dp tall.
  link: { minHeight: CONTROL_H, justifyContent: 'center', paddingHorizontal: 16 },
  linkText: { ...TYPE.body, color: colors.link, textAlign: 'center' },
}));
