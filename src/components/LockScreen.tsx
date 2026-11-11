import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { PinPad } from '@/components/PinPad';
import { checkPin, hasDeviceLock, isBiometricEnabled, storedPinLength, unlockWithBiometrics, verifyDeviceOwner, waitSeconds } from '@/lock/store';
import { colors } from '@/theme';

// Full-screen lock over the app (section 19). The app stays mounted underneath, so unlocking keeps your place.
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [wait, setWait] = useState(waitSeconds);
  const length = storedPinLength();

  const tryBiometrics = useCallback(async () => {
    if (await unlockWithBiometrics(t('lock.biometricPrompt'), t('lock.usePin'))) onUnlock();
  }, [onUnlock, t]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true); // no navigating behind the lock
    if (isBiometricEnabled()) void tryBiometrics();
    return () => sub.remove();
  }, [tryBiometrics]);

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
            <Pressable onPress={tryBiometrics} accessibilityRole="button" accessibilityLabel={t('lock.biometric')} hitSlop={8}>
              <Text style={styles.icon}>☝</Text>
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
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  message: { fontSize: 15, color: colors.muted, textAlign: 'center', minHeight: 20 },
  error: { color: colors.soon.fg },
  icon: { fontSize: 28 },
  link: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  linkText: { fontSize: 16, fontWeight: '600', color: colors.primary },
});
