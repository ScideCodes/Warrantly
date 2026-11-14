import { useState } from 'react';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from '@/components/themeMotion';
import { SheetFrame } from '@/components/Sheet';
import { Button, GlassButton } from '@/components/ui';
import { colors, TYPE, themed } from '@/theme';
import { calendarDate, initialDate, monthDays } from '@/calendar';
import { todayYmd } from '@/warranty';

type Request = { title: string; value: string; minimum?: string; onPick: (date: string) => void };

// Each request gets fresh draft state. Closing keeps the frame mounted for its exit spring.
export function useDatePicker() {
  const [request, setRequest] = useState<(Request & { key: number }) | null>(null);
  const [open, setOpen] = useState(false);
  return {
    pickDate: (next: Request) => { Keyboard.dismiss(); setRequest(previous => ({ ...next, key: (previous?.key ?? 0) + 1 })); setOpen(true); },
    datePicker: request ? <Calendar key={request.key} request={request} open={open} close={() => setOpen(false)} /> : null,
  };
}

function Calendar({ request, open, close }: { request: Request; open: boolean; close: () => void }) {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const locale = i18n.language.startsWith('hu') ? 'hu-HU' : 'en-US';
  const mondayFirst = locale === 'hu-HU';
  const [selected, setSelected] = useState(() => initialDate(request.value, request.minimum));
  const initial = calendarDate(selected);
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [yearPage, setYearPage] = useState(Math.floor(initial.getFullYear() / 12) * 12);
  const monthName = (m: number) => new Date(year, m, 1).toLocaleDateString(locale, { month: 'long' });
  const days = monthDays(year, month, mondayFirst);
  while (days.length % 7) days.push(null);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const navigate = (step: number) => {
    if (mode === 'months') return setYear(v => Math.max(1900, Math.min(9999, v + step)));
    if (mode === 'years') return setYearPage(v => Math.max(1900, Math.min(9988, v + step * 12)));
    const date = new Date(year, month + step, 1, 12);
    if (date.getFullYear() >= 1900 && date.getFullYear() <= 9999) { setYear(date.getFullYear()); setMonth(date.getMonth()); }
  };
  const cell = (label: string, onPress: () => void, options: { selected?: boolean; disabled?: boolean; accessibilityLabel?: string; wide?: boolean } = {}) => (
    <Pressable key={options.accessibilityLabel ?? label} onPress={onPress} disabled={options.disabled}
      accessibilityRole="button" accessibilityLabel={options.accessibilityLabel ?? label}
      accessibilityState={{ selected: !!options.selected, disabled: !!options.disabled }}
      style={[styles.cell, options.wide && styles.wide]}>
      <View style={[styles.day, options.selected && styles.selected]}>
        <Text maxFontSizeMultiplier={1.5} numberOfLines={1} style={[styles.dayText, options.selected && styles.selectedText, options.disabled && styles.disabled]}>{label}</Text>
      </View>
    </Pressable>
  );
  return <SheetFrame open={open} onClose={close} title={request.title}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} scrollEventThrottle={16} overScrollMode="never" showsVerticalScrollIndicator={false}>
      <View style={styles.heading}>
        <GlassButton icon="chevron-back" label={t(mode === 'years' ? 'calendar.previousYears' : mode === 'months' ? 'calendar.previousYear' : 'calendar.previousMonth')} onPress={() => navigate(-1)} />
        <View style={styles.headingText}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.chooseMonth')} onPress={() => setMode(mode === 'months' ? 'days' : 'months')}><Text numberOfLines={1} style={styles.month}>{monthName(month)}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.chooseYear')} onPress={() => setMode(mode === 'years' ? 'days' : 'years')}><Text style={styles.year}>{mode === 'years' ? `${yearPage}–${yearPage + 11}` : year}</Text></Pressable>
        </View>
        <GlassButton icon="chevron-forward" label={t(mode === 'years' ? 'calendar.nextYears' : mode === 'months' ? 'calendar.nextYear' : 'calendar.nextMonth')} onPress={() => navigate(1)} />
      </View>
      {mode === 'days' && <>
        <View style={styles.week}>{Array.from({ length: 7 }, (_, i) => <View key={i} style={styles.cell}><Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.weekday}>{new Date(2026, 10, 1 + i + (mondayFirst ? 1 : 0)).toLocaleDateString(locale, { weekday: 'narrow' })}</Text></View>)}</View>
        {weeks.map((week, w) => <View key={w} style={styles.week}>{week.map((date, i) => date ? cell(String(calendarDate(date).getDate()), () => setSelected(date), { selected: selected === date, disabled: !!request.minimum && date < request.minimum, accessibilityLabel: calendarDate(date).toLocaleDateString(locale, { dateStyle: 'full' }) }) : <View key={`blank-${i}`} style={styles.cell} />)}</View>)}
      </>}
      {mode === 'months' && <View style={styles.grid}>{Array.from({ length: 12 }, (_, m) => cell(new Date(year, m, 1).toLocaleDateString(locale, { month: 'short' }), () => { setMonth(m); setMode('days'); }, { wide: true, selected: m === month }))}</View>}
      {mode === 'years' && <View style={styles.grid}>{Array.from({ length: 12 }, (_, i) => cell(String(yearPage + i), () => { setYear(yearPage + i); setMode('months'); }, { wide: true, selected: yearPage + i === year, disabled: yearPage + i < 1900 || yearPage + i > 9999 }))}</View>}
      <Text style={styles.summary}>{calendarDate(selected).toLocaleDateString(locale, { dateStyle: 'long' })}</Text>
    </ScrollView>
      <View style={styles.actions}>
        <Button kind="glass" title={t('calendar.today')} disabled={!!request.minimum && todayYmd() < request.minimum} onPress={() => { const now = calendarDate(todayYmd()); setSelected(todayYmd()); setYear(now.getFullYear()); setMonth(now.getMonth()); setMode('days'); }} />
        <Button title={t('calendar.done')} onPress={() => { request.onPick(selected); close(); }} />
      </View>
  </SheetFrame>;
}

const useStyles = themed(() => StyleSheet.create({
  scroll: { flexShrink: 1, minHeight: 0 },
  content: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingText: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 4 },
  month: { ...TYPE.headline, color: colors.ink, textTransform: 'capitalize', paddingHorizontal: 8, paddingVertical: 10 },
  year: { ...TYPE.sub, fontVariant: ['tabular-nums'], minHeight: 44, textAlignVertical: 'center', color: colors.tint, paddingHorizontal: 12, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  wide: { flex: undefined, width: '25%', minHeight: 54 },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontVariant: ['tabular-nums'], ...TYPE.body, color: colors.ink },
  selected: { backgroundColor: colors.accent },
  selectedText: { color: colors.onAccent, fontWeight: '600' },
  disabled: { color: colors.ink2, opacity: 0.35 },
  weekday: { ...TYPE.foot, color: colors.ink2 },
  summary: { ...TYPE.sub, color: colors.ink2, textAlign: 'center', marginVertical: 8 },
  actions: { paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
}));
