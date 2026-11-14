import { Text, View } from '@/components/themeMotion';
import { StyleSheet } from 'react-native';
import AppIcon, { type IconName } from '@/components/Icon';
import { colors, TYPE, themed } from '@/theme';

// Quiet list feedback: one relevant glyph, readable copy, no decorative card or oversized hero.
export function EmptyState({ message, icon }: { message: string; icon: IconName }) {
  const styles = useStyles();
  return <View style={styles.body} accessible accessibilityRole="text">
    <AppIcon name={icon} size={24} color={colors.ink2} importantForAccessibility="no" />
    <Text style={styles.message}>{message}</Text>
  </View>;
}
const useStyles = themed(() => StyleSheet.create({
  body: { paddingHorizontal: 16, paddingVertical: 28, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  message: { ...TYPE.sub, color: colors.ink2, flex: 1, minWidth: 0 },
}));
