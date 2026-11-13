import { Pressable, Text, View } from '@/components/themeMotion';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { colors, ROW_H, ROW_PAD, ROW_X, TYPE, themed, useRoom } from '@/theme';
import { Group, SectionHeader } from '@/components/ui';

// A titled group: the reference's section header, then one grouped card. Used on detail, add/edit and
// the viewer, so every screen groups things the same way.
export function Section({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <View>
      <SectionHeader title={title} first={first} />
      <Group>{children}</Group>
    </View>
  );
}

// A label and its value side by side (iOS's Value1 cell): the label in the secondary colour at the left, the
// value right-aligned. Each wraps inside its own column (label up to 45 %), so a long Hungarian label or a long
// value adds a line, not a stacked block. Only when the column is narrower than 260 text-size-adjusted dp
// (small phone with large text) does the label go above the value. The line between rows is inset 16.
export function Field({ label, value, onPress, last }: { label: string; value: string; onPress?: () => void; last?: boolean }) {
  const styles = useStyles();
  const side = useRoom()(260);
  const body = (
    <>
      <Text style={[styles.label, side && styles.labelSide]}>{label}</Text>
      <Text style={[styles.value, side && styles.valueSide, onPress && styles.link]}>{value}</Text>
      {!last && <View style={styles.line} />}
    </>
  );
  const style = [styles.field, side && styles.fieldSide];
  return onPress ? (
    <Pressable style={({ pressed }) => [style, pressed && { backgroundColor: colors.press }]} onPress={onPress} accessibilityRole="link">
      {body}
    </Pressable>
  ) : (
    <View style={style} accessible accessibilityLabel={`${label}: ${value}`}>
      {body}
    </View>
  );
}

const useStyles = themed(() => StyleSheet.create({
  field: { minHeight: ROW_H, justifyContent: 'center', paddingVertical: ROW_PAD, paddingHorizontal: ROW_X },
  fieldSide: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  label: { ...TYPE.foot, color: colors.ink2 },
  labelSide: { ...TYPE.body, color: colors.ink2, flexShrink: 1, maxWidth: '45%' },
  value: { ...TYPE.body, color: colors.ink },
  valueSide: { flex: 1, textAlign: 'right' },
  link: { color: colors.link },
  line: { position: 'absolute', left: ROW_X, right: ROW_X, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
}));
