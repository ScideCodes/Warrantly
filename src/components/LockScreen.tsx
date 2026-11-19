import { Pressable, Text, View } from '@/components/themeMotion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { AppState, BackHandler, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { PinLayout, PinPad } from '@/components/PinPad';
import { checkPin, hasDeviceLock, isBiometricEnabled, storedPinLength, unlockWithBiometrics, verifyDeviceOwner, waitSeconds } from '@/lock/store';
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

  // Ask for the fingerprint by itself when the lock shows. Android closes a prompt opened while it is still
  // bringing the app to the front (splash screen, window focus), so wait until the app is in front and keep
  // trying while the system (not the person) closes it. "Use PIN", cancel or a lockout stay the person's answer.
  // Runs once per lock: `t` changes when the language loads at startup, and a second prompt would cancel the first.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  useEffect(() => {
    if (!isBiometricEnabled()) return;
    let alive = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const ready = () => AppState.currentState === 'active' && windowFocused;
    const inFront = () =>
      new Promise<void>((resolve) => {
        if (ready()) return resolve();
        const check = () => ready() && (subs.forEach((s) => s.remove()), resolve());
        const subs = [AppState.addEventListener('change', check), ...(Platform.OS === 'android' ? [AppState.addEventListener('focus', check)] : [])];
      });
    const DELAYS = [300, 700, 1200, 2000];
    const ANSWERED = ['user_cancel', 'user_fallback', 'lockout', 'not_enrolled', 'not_available', 'passcode_not_set'];
    (async () => {
      for (let attempt = 0; attempt < DELAYS.length && alive; attempt++) {
        await inFront();
        await sleep(DELAYS[attempt]);
        if (!alive) return;
        const res = await unlockWithBiometrics(tRef.current('lock.biometricPrompt'), tRef.current('lock.usePin'));
        if (res.success) return onUnlock();
        if (!alive || (res.error && ANSWERED.includes(res.error))) return;
        const note = `fingerprint prompt closed by Android (${res.error}), attempt ${attempt + 1}`;
        logError(note, 'lock');
        console.warn('lock', note);
      }
    })();
    return () => {
      alive = false;
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
