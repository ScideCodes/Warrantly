import { View } from '@/components/themeMotion';
import { useState } from 'react';
import { goBack } from '@/nav';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { PinLayout, PinPad } from '@/components/PinPad';
import { MAX_PIN, MIN_PIN } from '@/lock/pin.ts';
import { getDb } from '@/db/client';
import { isLockEnabled, setPin } from '@/lock/store';
import { setWidgetNames } from '@/settings';
import { updateWidget } from '@/widget';
import { rescheduleReminders } from '@/reminders';
import { NavBar } from '@/components/Page';
import { Button } from '@/components/ui';
import { BAR_H, themed } from '@/theme';

// Choose a PIN (turn the lock on, change it, or after "Forgot PIN"): enter, then confirm.
export default function PinSetup() {
  const styles = useStyles();
  const { t } = useTranslation();
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [shake, setShake] = useState(0);
  const insets = useSafeAreaInsets();

  function onDigit(d: string) {
    if (mismatch) setMismatch(false);
    const next = value + d;
    if (next.length > MAX_PIN) return;
    if (first === null) return setValue(next);
    if (next.length < first.length) return setValue(next);
    if (next === first) {
      if (!isLockEnabled()) setWidgetNames(null); // lock turned on: names go back to hidden on the widget
      setPin(next);
      void getDb().then(updateWidget).catch((e) => console.warn('widget', e));
      void getDb().then(rescheduleReminders).catch((e) => console.warn('reminders', e)); // titles stop naming products
      return goBack();
    }
    setFirst(null);
    setValue('');
    setMismatch(true);
    setShake((n) => n + 1);
  }

  return (
    <>
      <PinLayout
        icon="lock-closed"
        title={first === null ? t('pin.titleNew') : t('pin.confirm')}
        message={mismatch ? t('pin.mismatch') : first === null ? t('pin.chooseHint') : t('pin.confirmHint')}
        step={first === null ? 1 : 2}
        error={mismatch}
        top={insets.top + BAR_H}
        pad={<PinPad value={value} dots={first?.length ?? Math.max(MIN_PIN, value.length)} onDigit={onDigit} onDelete={() => setValue((v) => v.slice(0, -1))} shake={shake} />}
        footer={
          // Kept in the layout when confirming (hidden), so the keys stay where they were at any text size.
          <View style={first !== null && styles.hidden} pointerEvents={first === null ? 'auto' : 'none'} importantForAccessibility={first === null ? 'auto' : 'no-hide-descendants'}>
            <Button
              title={t('pin.continue')}
              disabled={first !== null || value.length < MIN_PIN}
              style={styles.button}
              onPress={() => {
                setFirst(value);
                setValue('');
                setMismatch(false);
              }}
            />
          </View>
        }
      />
      <NavBar />
    </>
  );
}

const useStyles = themed(() => StyleSheet.create({
  button: { minWidth: 220 },
  hidden: { opacity: 0 },
}));
