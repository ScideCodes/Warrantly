import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CARD_RADIUS, colors, FONT, SPACE } from '@/theme';

// A titled group: a plain heading, then one white surface. Used on detail, add/edit and the viewer, so
// every screen groups things the same way.
export function Section({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <View style={!first && styles.gap}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

// Label above value, with a thin line under it; the value wraps.
export function Field({ label, value, onPress, last }: { label: string; value: string; onPress?: () => void; last?: boolean }) {
  const body = (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, onPress && styles.link]}>{value}</Text>
    </>
  );
  return onPress ? (
    <Pressable style={[styles.field, last && styles.last]} onPress={onPress} accessibilityRole="link">
      {body}
    </Pressable>
  ) : (
    <View style={[styles.field, last && styles.last]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: SPACE.section },
  title: { fontSize: FONT.heading, fontWeight: '700', color: colors.text, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.surface, borderRadius: CARD_RADIUS, paddingHorizontal: SPACE.group },
  field: { paddingVertical: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  label: { fontSize: 14, color: colors.muted },
  value: { fontSize: FONT.body, color: colors.text },
  link: { color: colors.primary, fontWeight: '600' },
  last: { borderBottomWidth: 0 },
});
