import { memo, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from '@/components/themeMotion';
import { SheetFrame } from '@/components/Sheet';
import { Button } from '@/components/ui';
import { colors, TYPE, themed } from '@/theme';

type Request = { value: number; onPick: (minutes: number) => void };
const pad = (value: number) => String(value).padStart(2, '0');

export function useTimePicker() {
  const [request, setRequest] = useState<(Request & { key: number }) | null>(null);
  const [open, setOpen] = useState(false);
  return {
    pickTime: (next: Request) => {
      Keyboard.dismiss();
      setRequest(previous => ({ ...next, key: (previous?.key ?? 0) + 1 }));
      setOpen(true);
    },
    timePicker: request ? <TimeSheet key={request.key} request={request} open={open} close={() => setOpen(false)} /> : null,
  };
}

function TimeSheet({ request, open, close }: { request: Request; open: boolean; close: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const [initial] = useState(() => Number.isInteger(request.value) && request.value >= 0 && request.value < 1440 ? request.value : 540);
  // Read on Done only: the wheels keep their own highlight, so scrolling one does not redraw the sheet or the other wheel.
  const time = useRef({ hour: Math.floor(initial / 60), minute: initial % 60 });
  return <SheetFrame open={open} onClose={close} title={t('settings.reminderTime')}>
    <View style={styles.content}>
      <View style={styles.wheels}>
        <Wheel label={t('calendar.hours')} count={24} initial={Math.floor(initial / 60)} onChange={(h) => (time.current.hour = h)} />
        <Text style={styles.colon} importantForAccessibility="no">:</Text>
        <Wheel label={t('calendar.minutes')} count={60} initial={initial % 60} onChange={(m) => (time.current.minute = m)} />
      </View>
      <Button title={t('calendar.done')} onPress={() => { request.onPick(time.current.hour * 60 + time.current.minute); close(); }} />
    </View>
  </SheetFrame>;
}

function Wheel({ label, count, initial, onChange }: { label: string; count: number; initial: number; onChange: (value: number) => void }) {
  const styles = useStyles();
  const { fontScale, height } = useWindowDimensions();
  const row = Math.max(44, Math.ceil(28 * fontScale + 12));
  const visibleRows = height / fontScale < 600 ? 3 : 5;
  const inset = row * ((visibleRows - 1) / 2);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [value, setValue] = useState(initial);
  // Runs every scroll frame; the state (and so a redraw) changes only when the middle row changes.
  const pick = (next: number) => {
    setValue(next);
    onChange(next);
  };
  return <View style={styles.column}>
    <Text style={styles.label}>{label}</Text>
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: count - 1, now: value, text: pad(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => {
        const next = Math.max(0, Math.min(count - 1, value + (event.nativeEvent.actionName === 'increment' ? 1 : -1)));
        pick(next);
        scroll.current?.scrollTo({ y: next * row, animated: false });
      }}>
      <View pointerEvents="none" style={[styles.selection, { top: inset, height: row }]} />
      <ScrollView ref={scroll} style={{ height: row * visibleRows }} contentContainerStyle={{ paddingVertical: inset }}
        contentOffset={{ x: 0, y: initial * row }} showsVerticalScrollIndicator={false}
        snapToInterval={row} decelerationRate="fast" bounces={false} scrollEventThrottle={16} overScrollMode="never"
        importantForAccessibility="no-hide-descendants"
        onScroll={event => pick(Math.max(0, Math.min(count - 1, Math.round(event.nativeEvent.contentOffset.y / row))))}>
        {Array.from({ length: count }, (_, i) => <WheelRow key={i} i={i} height={row} chosen={i === value} />)}
      </ScrollView>
    </View>
  </View>;
}

// Memo: a new middle row redraws only the two rows whose highlight changed, not the whole wheel.
const WheelRow = memo(function WheelRow({ i, height, chosen }: { i: number; height: number; chosen: boolean }) {
  const styles = useStyles();
  return <View style={[styles.item, { height }]}>
    <Text style={[styles.number, chosen && styles.chosen]}>{pad(i)}</Text>
  </View>;
});

const useStyles = themed(() => StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 20, gap: 20 },
  wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  column: { flex: 1, maxWidth: 136, minWidth: 0, gap: 8 },
  label: { ...TYPE.foot, color: colors.ink2, textAlign: 'center' },
  colon: { ...TYPE.title2, color: colors.ink2, paddingTop: 24 },
  selection: { position: 'absolute', left: 0, right: 0, borderRadius: 14, backgroundColor: colors.fill },
  item: { alignItems: 'center', justifyContent: 'center' },
  number: { ...TYPE.title2, fontWeight: '400', color: colors.ink2, fontVariant: ['tabular-nums'] },
  chosen: { color: colors.ink, fontWeight: '600' },
}));
