import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Pressable, Text, View } from '@/components/themeMotion';
import { colors, TYPE } from '@/theme';

// Uniform cells within each group; wide text and larger fonts switch the entire grid to one column.
export default function ChoicePills({ options, disabled }: { options: { key: string; label: string; selected: boolean; onPress: () => void }[]; disabled: boolean }) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const minimum = Math.max(...options.map(option => option.label.length * 14 * 0.6)) * fontScale + 28;
  const columns = width >= minimum * 2 + 8 ? 2 : 1;
  const cellWidth = columns === 2 ? (width - 8) / 2 : width || undefined;
  const height = Math.max(44, Math.ceil(19 * fontScale + 20));
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
    {options.map(option => <Pressable key={option.key} onPress={option.onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected: option.selected, disabled }}
      style={{ width: cellWidth, minWidth: width ? undefined : '100%', height, paddingHorizontal: 14, borderRadius: height / 2, backgroundColor: option.selected ? colors.tintSoft : colors.fill, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ ...TYPE.sub, fontWeight: option.selected ? '600' : '500', color: option.selected ? colors.tintInk : colors.ink }} numberOfLines={1}>{option.label}</Text>
    </Pressable>)}
  </View>;
}
