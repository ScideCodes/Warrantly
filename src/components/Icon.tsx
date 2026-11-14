import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useThemeTransition } from '@/components/themeMotion';

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);
const AnimatedProductIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

export type IconName = keyof typeof Ionicons.glyphMap;
type Props = ComponentProps<typeof Ionicons>;

const glyphBox = (size: number) => ({ width: size, height: size, lineHeight: size, textAlign: 'center' as const, textAlignVertical: 'center' as const, includeFontPadding: false, flexShrink: 0 });

// Fractions of the glyph size: asymmetric ink needs a small optical correction after
// centering its em square. Keep these here so tiles, bars and buttons agree.
const optical: Partial<Record<IconName, readonly [number, number]>> = {
  'chevron-back': [-0.02, 0],
  'chevron-forward': [0.02, 0],
  'funnel-outline': [0, 0.07],
  'download-outline': [0, -0.04],
  'create-outline': [0.025, -0.025],
  'share-social-outline': [-0.03, 0],
  'shield-checkmark': [0, 0.025],
  'shield-checkmark-outline': [0, 0.025],
  'backspace-outline': [-0.035, 0],
  checkmark: [0, -0.025],
};

export default function Icon({ name, size = 24, style, ...props }: Props) {
  const transition = useThemeTransition();
  const [x, y] = optical[name] ?? [0, 0];
  const transform = StyleSheet.flatten(style)?.transform;
  return (
    <AnimatedIonicons
      {...props}
      name={name}
      size={size}
      allowFontScaling={false}
      style={[
        glyphBox(size),
        style,
        { ...transition, transitionProperty: ['color'], color: props.color },
        (x !== 0 || y !== 0) && { transform: typeof transform === 'string'
          ? `${transform} translate(${x * size}px, ${y * size}px)`
          : [...(transform ?? []), { translateX: x * size }, { translateY: y * size }] },
      ]}
    />
  );
}

// Product/category glyphs use a second font but the same stable layout box.
export function ProductIcon({ size = 18, style, ...props }: ComponentProps<typeof MaterialCommunityIcons>) {
  const transition = useThemeTransition();
  return <AnimatedProductIcon {...props} size={size} allowFontScaling={false} style={[glyphBox(size), style, { ...transition, transitionProperty: ['color'], color: props.color }]} />;
}
