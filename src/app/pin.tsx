import { useState } from 'react';
import { Stack } from 'expo-router';
import { goBack } from '@/nav';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PinPad } from '@/components/PinPad';
import { MAX_PIN, MIN_PIN } from '@/lock/pin.ts';
import { setPin } from '@/lock/store';
import { colors } from '@/theme';

// Choose a PIN (turn the lock on, change it, or after "Forgot PIN"): enter, then confirm.
export default function PinSetup() {
  const { t } = useTranslation();
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [mismatch, setMismatch] = useState(false);

  function onDigit(d: string) {
    const next = value + d;
    if (next.length > MAX_PIN) return;
    if (first === null) return setValue(next);
    if (next.length < first.length) return setValue(next);
    if (next === first) {
      setPin(next);
      return goBack();
    }
    setFirst(null);
    setValue('');
    setMismatch(true);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('settings.lock') }} />
      <View style={styles.screen}>
        <View style={styles.top}>
          <Text style={styles.title} accessibilityRole="header">
            {first === null ? t('pin.titleNew') : t('pin.confirm')}
          </Text>
          <Text style={[styles.hint, mismatch && styles.error]} accessibilityLiveRegion="polite">
            {mismatch ? t('pin.mismatch') : t('pin.hint')}
          </Text>
        </View>
        <PinPad value={value} dots={first?.length ?? Math.max(MIN_PIN, value.length)} onDigit={onDigit} onDelete={() => setValue((v) => v.slice(0, -1))} />
        {first === null && (
          <Pressable
            style={[styles.button, value.length < MIN_PIN && styles.buttonDisabled]}
            disabled={value.length < MIN_PIN}
            onPress={() => {
              setFirst(value);
              setValue('');
              setMismatch(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: value.length < MIN_PIN }}
          >
            <Text style={styles.buttonText}>{t('pin.continue')}</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'space-evenly', padding: 24 },
  top: { alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  hint: { fontSize: 15, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  error: { color: colors.soon.fg },
  button: { minHeight: 48, minWidth: 200, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { backgroundColor: colors.primaryDisabled },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
});
