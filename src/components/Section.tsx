import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, ROW_TALL, ROW_X, TYPE } from '@/theme';
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

// The reference's Tall row (`.ts .row`, 68dp): Footnote label above a Body value that wraps. The line
// between rows is inset 16 at both ends.
export function Field({ label, value, onPress, last }: { label: string; value: string; onPress?: () => void; last?: boolean }) {
  const body = (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, onPress && styles.link]}>{value}</Text>
      {!last && <View style={styles.line} />}
    </>
  );
  return onPress ? (
    <Pressable style={({ pressed }) => [styles.field, pressed && { backgroundColor: colors.press }]} onPress={onPress} accessibilityRole="link">
      {body}
    </Pressable>
  ) : (
    <View style={styles.field}>{body}</View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: ROW_TALL, justifyContent: 'center', paddingVertical: 14, paddingHorizontal: ROW_X },
  label: { ...TYPE.foot, color: colors.ink2 },
  value: { ...TYPE.body, color: colors.ink },
  link: { color: colors.link },
  line: { position: 'absolute', left: ROW_X, right: ROW_X, bottom: 0, height: 1, backgroundColor: colors.line },
});
