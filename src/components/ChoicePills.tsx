import { useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Pressable, Text, View } from '@/components/themeMotion';
import { GlassFill } from '@/components/GlassFill';
import { glass } from '@/components/ui';
import { pillColumns } from '@/pillColumns';
import { colors, TYPE } from '@/theme';

// Glass pills of one width, in rows that are always full: three choices sit side by side or stack, never
// two over one. Labels are measured as drawn, so translations and larger text pick the right grid.
export default function ChoicePills({ options, disabled }: { options: { key: string; label: string; selected: boolean; onPress: () => void }[]; disabled: boolean }) {
  const [width, setWidth] = useState(0);
  const [textWidths, setTextWidths] = useState<Record<string, number>>({});
  const { fontScale } = useWindowDimensions();
  const keyOf = (label: string) => `${fontScale}:${label}`;
  const measured = options.every((o) => textWidths[keyOf(o.label)] !== undefined)
    ? Math.max(...options.map((o) => textWidths[keyOf(o.label)])) : undefined;
  const columns = width && measured !== undefined ? pillColumns(options.length, width, measured + 2 * PAD, GAP) : 1;
  const cellWidth = width ? (width - GAP * (columns - 1)) / columns : undefined;
  const height = Math.max(44, Math.ceil(19 * fontScale + 20));
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.grid} accessibilityRole="radiogroup">
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.measure}>
        {options.map((o) => (
          <Text key={o.key} style={[styles.text, styles.bold]}
            onLayout={(e) => { const w = e.nativeEvent.layout.width; setTextWidths((p) => (p[keyOf(o.label)] === w ? p : { ...p, [keyOf(o.label)]: w })); }}>
            {o.label}
          </Text>
        ))}
      </View>
      {options.map((o) => (
        <Pressable key={o.key} onPress={o.onPress} disabled={disabled} pressScale={0.97} accessibilityRole="radio" accessibilityState={{ selected: o.selected, disabled }}
          style={[glass(), { width: cellWidth, minWidth: width ? undefined : '100%', height, borderRadius: height / 2 }]}>
          <GlassFill radius={height / 2} highlight={o.selected ? colors.tintSoft : undefined} style={styles.cell}>
            <Text style={[styles.text, o.selected && styles.bold, { color: o.selected ? colors.tintInk : colors.ink }]} numberOfLines={1}>{o.label}</Text>
          </GlassFill>
        </Pressable>
      ))}
    </View>
  );
}

const PAD = 14;
const GAP = 8;
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, alignItems: 'flex-start' },
  cell: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: PAD },
  text: { ...TYPE.sub, fontWeight: '500', flexShrink: 0 },
  bold: { fontWeight: '600' },
});
