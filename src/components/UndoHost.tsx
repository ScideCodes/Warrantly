import { StyleSheet } from 'react-native';
import Reanimated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/themeMotion';
import { glass } from '@/components/ui';
import { colors, CONTROL_H, TYPE, themed } from '@/theme';
import { runUndo, useUndo } from '@/undo';

// The undo snackbar: above the tab bar, a short message and Undo. Entering slides 12dp and fades (180 ms,
// ease-out); with reduced motion it only appears. Nothing else on the screen moves.
export function UndoHost() {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const current = useUndo();
  if (!current) return null;
  return (
    <Reanimated.View
      key={current.key}
      entering={FadeInDown.duration(180).withInitialValues({ transform: [{ translateY: 12 }] }).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutDown.duration(140).reduceMotion(ReduceMotion.System)}
      style={[styles.bar, glass(), { bottom: insets.bottom + 84 }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>{current.action.message}</Text>
      <Pressable onPress={() => void runUndo()} style={({ pressed }) => [styles.button, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${t('undo.undo')}: ${current.action.message}`} hitSlop={6}>
        <Text style={styles.buttonText}>{t('undo.undo')}</Text>
      </Pressable>
    </Reanimated.View>
  );
}

const useStyles = themed(() => StyleSheet.create({
  bar: { position: 'absolute', left: 16, right: 16, maxWidth: 560, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, paddingVertical: 6, paddingLeft: 18, paddingRight: 6, borderRadius: 26 },
  text: { ...TYPE.sub, color: colors.ink, flexGrow: 1, flexShrink: 1, flexBasis: 160, paddingVertical: 6 },
  button: { minHeight: CONTROL_H, minWidth: 64, paddingHorizontal: 14, borderRadius: CONTROL_H / 2, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  pressed: { backgroundColor: colors.press },
  buttonText: { ...TYPE.button, color: colors.link, fontWeight: '600' },
}));
