import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KEY_SIZE, PinPad } from '@/components/PinPad';
import { checkPin, hasDeviceLock, isBiometricEnabled, storedPinLength, unlockWithBiometrics, verifyDeviceOwner, waitSeconds } from '@/lock/store';
import { logError } from '@/errorLog';
import { colors, BUTTON_HEIGHT } from '@/theme';

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
    if (!(await hasDeviceLock())) return Alert.alert(t('lock.noDeviceLock'));
    if (await verifyDeviceOwner(t('lock.forgotPrompt'))) {
      onUnlock();
      router.push('/pin');
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <View style={styles.logo}>
          <Ionicons name="shield-checkmark" size={36} color={colors.onPrimary} />
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
              <Ionicons name="finger-print" size={34} color={colors.primary} />
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
  screen: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'space-evenly', zIndex: 10 },
  top: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  logo: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  message: { fontSize: 15, color: colors.muted, textAlign: 'center', minHeight: 20 },
  error: { color: colors.soon.fg },
  finger: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  fingerPressed: { opacity: 0.7 },
  link: { minHeight: BUTTON_HEIGHT, justifyContent: 'center', paddingHorizontal: 16 },
  linkText: { fontSize: 17, fontWeight: '600', color: colors.primary },
});
