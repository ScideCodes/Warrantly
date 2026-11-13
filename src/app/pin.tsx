import { useState } from 'react';
import { goBack } from '@/nav';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PinPad } from '@/components/PinPad';
import { MAX_PIN, MIN_PIN } from '@/lock/pin.ts';
import { getDb } from '@/db/client';
import { isLockEnabled, setPin } from '@/lock/store';
import { setWidgetNames } from '@/settings';
import { updateWidget } from '@/widget';
import { NavBar } from '@/components/Page';
import { Button } from '@/components/ui';
import { colors, TYPE } from '@/theme';

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
      if (!isLockEnabled()) setWidgetNames(null); // lock turned on: names go back to hidden on the widget
      setPin(next);
      void getDb().then(updateWidget).catch((e) => console.warn('widget', e));
      return goBack();
    }
    setFirst(null);
    setValue('');
    setMismatch(true);
  }

  return (
    <>
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
          <Button
            title={t('pin.continue')}
            disabled={value.length < MIN_PIN}
            style={styles.button}
            onPress={() => {
              setFirst(value);
              setValue('');
              setMismatch(false);
            }}
          />
        )}
      </View>
      <NavBar title={t('settings.lock')} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'space-evenly', padding: 24, paddingTop: 84 },
  top: { alignItems: 'center', gap: 8 },
  title: { ...TYPE.title2, color: colors.ink, textAlign: 'center' },
  hint: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', maxWidth: 320 },
  error: { color: colors.bad },
  button: { minWidth: 200 },
});
