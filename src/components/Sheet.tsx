import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BUTTON_HEIGHT, BUTTON_RADIUS, colors, FONT, SPACE } from '@/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export interface SheetOption {
  key: string;
  label: string;
  icon?: IconName;
  count?: number;
  selected?: boolean;
  destructive?: boolean;
  onPress: () => void;
}
export interface SheetSection {
  title?: string;
  options: SheetOption[];
}

// Bottom sheet for choices and less-used actions (filter, add a document, more actions). It rises from
// the bottom where the thumb is; a tap outside, Back or Close dismisses it. Plain Modal: no native library.
export function Sheet({ open, onClose, title, subtitle, sections }: { open: boolean; onClose: () => void; title: string; subtitle?: string; sections: SheetSection[] }) {
  const { t } = useTranslation();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('sheet.close')} />
      <View style={styles.panel}>
        <SafeAreaView edges={['bottom', 'left', 'right']}>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            {sections.map((s, i) => (
              <View key={i} style={i > 0 && styles.sectionGap}>
                {s.title ? <Text style={styles.sectionTitle}>{s.title}</Text> : null}
                {s.options.map((o) => (
                  <Pressable
                    key={o.key}
                    style={({ pressed }) => [styles.option, o.selected && styles.optionSelected, pressed && styles.pressed]}
                    onPress={() => {
                      onClose();
                      o.onPress();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !!o.selected }}
                  >
                    {o.icon && <Ionicons name={o.icon} size={22} color={o.destructive ? colors.soon.fg : o.selected ? colors.primary : colors.muted} />}
                    <Text style={[styles.label, o.selected && styles.labelSelected, o.destructive && styles.destructive]}>{o.label}</Text>
                    {o.count !== undefined && <Text style={styles.count}>{o.count}</Text>}
                    {o.selected && <Ionicons name="checkmark" size={22} color={colors.primary} />}
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>{t('sheet.close')}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: SPACE.group },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.divider, marginTop: 8, marginBottom: 12 },
  title: { fontSize: FONT.heading, fontWeight: '700', color: colors.text, paddingHorizontal: 4 },
  subtitle: { fontSize: FONT.small, color: colors.muted, paddingHorizontal: 4, marginTop: 4 },
  scroll: { flexGrow: 0 },
  content: { paddingTop: 12, paddingBottom: 8 },
  sectionGap: { marginTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.muted, paddingHorizontal: 4, paddingBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: BUTTON_HEIGHT, paddingVertical: 10, paddingHorizontal: 12, borderRadius: BUTTON_RADIUS },
  optionSelected: { backgroundColor: colors.primarySoft },
  pressed: { backgroundColor: colors.background },
  label: { flex: 1, fontSize: FONT.body, color: colors.text },
  labelSelected: { fontWeight: '700', color: colors.primary },
  destructive: { color: colors.soon.fg },
  count: { fontSize: FONT.small, color: colors.muted },
  close: { minHeight: BUTTON_HEIGHT, alignItems: 'center', justifyContent: 'center', marginVertical: 8, borderRadius: BUTTON_RADIUS, backgroundColor: colors.background },
  closeText: { fontSize: FONT.body, fontWeight: '600', color: colors.text },
});
