import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KEY_SIZE, PinPad } from '@/components/PinPad';
import { checkPin, hasDeviceLock, isBiometricEnabled, storedPinLength, unlockWithBiometrics, verifyDeviceOwner, waitSeconds } from '@/lock/store';
import { logError } from '@/errorLog';
import { showAlert } from '@/components/Dialog';
import { colors, CONTROL_H, TYPE } from '@/theme';

// Full-screen lock over the app (section 19). The app stays mounted underneath, so unlocking keeps your place.
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [wait, setWait] = useState(waitSeconds);
  const length = storedPinLength();

  const tryBiometrics = useCallback(async () => {
    if ((await unlockWithBiometrics(t('lock.biometricPrompt'), t('lock.usePin'))).success) onUnlock();
  }, [onUnlock, t]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true); // no navigating behind the lock
    return () => sub.remove();
  }, []);

  // Ask for the fingerprint by itself when the lock shows. Android closes a prompt opened while it is still
  // bringing the app to the front, so wait until the app is in front, then try again once if the system
  // (not the person) closed it. "Use PIN" stays the person's choice.
  useEffect(() => {
    if (!isBiometricEnabled()) return;
    let alive = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const inFront = () =>
      new Promise<void>((resolve) => {
        if (AppState.currentState === 'active') return resolve();
        const sub = AppState.addEventListener('change', (s) => s === 'active' && (sub.remove(), resolve()));
      });
    (async () => {
      for (let attempt = 0; attempt < 2 && alive; attempt++) {
        await inFront();
        await sleep(attempt ? 700 : 300);
        if (!alive) return;
        const res = await unlockWithBiometrics(t('lock.biometricPrompt'), t('lock.usePin'));
        if (res.success) return onUnlock();
        if (res.error !== 'system_cancel' && res.error !== 'app_cancel') return;
        const note = `fingerprint prompt closed by Android (${res.error}), attempt ${attempt + 1}`;
        logError(note, 'lock');
        console.warn('lock', note);
      }
    })();
    return () => {
      alive = false;
    };
  }, [onUnlock, t]);

  useEffect(() => {
    if (!wait) return;
    const timer = setInterval(() => setWait(waitSeconds()), 1000);
    return () => clearInterval(timer);
  }, [wait]);

  function onDigit(d: string) {
    if (wait) return;
    const next = pin + d;
    if (next.length < length) return setPin(next);
    if (checkPin(next)) return onUnlock();
    setPin('');
    setWrong(true);
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
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <View style={styles.logo}>
          <Ionicons name="shield-checkmark" size={32} color="#fff" />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t('lock.title')}
        </Text>
        <Text style={[styles.message, (wrong || wait > 0) && styles.error]} accessibilityLiveRegion="polite">
          {wait > 0 ? t('lock.wait', { count: wait }) : wrong ? t('lock.wrong') : ' '}
        </Text>
      </View>
      <PinPad
        value={pin}
        dots={length}
        onDigit={onDigit}
        onDelete={() => setPin((p) => p.slice(0, -1))}
        extra={
          isBiometricEnabled() && (
            <Pressable
              style={({ pressed }) => [styles.finger, pressed && styles.fingerPressed]}
              onPress={tryBiometrics}
              accessibilityRole="button"
              accessibilityLabel={t('lock.biometric')}
            >
              <Ionicons name="finger-print" size={34} color={colors.tint} />
            </Pressable>
          )
        }
      />
      <Pressable style={styles.link} onPress={forgot} accessibilityRole="button">
        <Text style={styles.linkText}>{t('lock.forgot')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'space-evenly', zIndex: 10 },
  top: { alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  // The reference's large tile (`.detail-hero .hardware-icon`): 56dp, 14 radius, 32dp white glyph.
  logo: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#007aff', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { ...TYPE.title2, color: colors.ink },
  message: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', minHeight: 20 },
  error: { color: colors.bad },
  finger: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  fingerPressed: { backgroundColor: colors.fill2 },
  link: { minHeight: CONTROL_H, justifyContent: 'center', paddingHorizontal: 16 },
  linkText: { ...TYPE.body, color: colors.link },
});
