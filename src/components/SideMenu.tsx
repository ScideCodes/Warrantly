import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme';

export interface MenuItem {
  key: string;
  label: string;
  count?: number;
  selected?: boolean;
  onPress: () => void;
}
export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

// Gmail-style side menu: slides in from the left over a dimmed screen; a tap outside or Back closes it.
// Built on Modal + Animated so it needs no native navigation library.
export function SideMenu({ open, onClose, title, subtitle, sections }: { open: boolean; onClose: () => void; title: string; subtitle?: string; sections: MenuSection[] }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const panel = Math.min(320, width * 0.85);
  const [x] = useState(() => new Animated.Value(-panel));
  useEffect(() => {
    Animated.timing(x, { toValue: open ? 0 : -panel, duration: 180, useNativeDriver: true }).start();
  }, [open, panel, x]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('home.closeMenu')} />
      <Animated.View style={[styles.panel, { width: panel, transform: [{ translateX: x }] }]}>
        <SafeAreaView style={styles.fill} edges={['top', 'bottom', 'left']}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {sections.map((s, i) => (
              <View key={i} style={[styles.section, i > 0 && styles.divider]}>
                {s.title && <Text style={styles.sectionTitle}>{s.title}</Text>}
                {s.items.map((it) => (
                  <Pressable
                    key={it.key}
                    style={[styles.item, it.selected && styles.itemSelected]}
                    onPress={() => {
                      onClose();
                      it.onPress();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !!it.selected }}
                  >
                    <Text style={[styles.itemText, it.selected && styles.itemTextSelected]} numberOfLines={1}>
                      {it.label}
                    </Text>
                    {it.count !== undefined && <Text style={[styles.count, it.selected && styles.itemTextSelected]}>{it.count}</Text>}
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.background, borderTopRightRadius: 16, borderBottomRightRadius: 16 },
  fill: { flex: 1 },
  content: { paddingVertical: 16, paddingHorizontal: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: 16, paddingTop: 8 },
  subtitle: { fontSize: 15, color: colors.muted, paddingHorizontal: 16, paddingBottom: 8 },
  section: { paddingVertical: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', paddingHorizontal: 16, paddingVertical: 8 },
  item: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 26 },
  itemSelected: { backgroundColor: colors.surface },
  itemText: { flex: 1, fontSize: 16, color: colors.text },
  itemTextSelected: { fontWeight: '700', color: colors.primary },
  count: { fontSize: 15, color: colors.muted },
});
