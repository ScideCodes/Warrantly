import { forwardRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Pressable as NativePressable,
  TextInput as NativeTextInput,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native';
import Animated from 'react-native-reanimated';

// One preference listener for the app, including changes made while it is open.
// Start with motion disabled until the asynchronous accessibility query resolves.
let reduced = true;
let preferenceVersion = 0;
const listeners = new Set<() => void>();
function setReduced(value: boolean) {
  if (value === reduced) return;
  reduced = value;
  listeners.forEach((notify) => notify());
}
void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
  if (preferenceVersion === 0) setReduced(value);
}).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
  preferenceVersion++;
  setReduced(value);
});
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
};
export const reduceMotion = () => reduced;

// CSS colour transitions run on the UI thread. No palette updates every frame,
// screenshots, overlays or remounting: forms, scroll positions and dialogs survive.
// Explicit properties keep layout, press scales and scrolling out of the transition.
export function useThemeTransition() {
  const reduce = useSyncExternalStore(subscribe, reduceMotion, () => true);
  return {
    transitionProperty: ['backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'],
    transitionDuration: reduce ? '0ms' : '220ms',
    transitionTimingFunction: 'ease-out' as const,
  };
}

export const View = forwardRef<ComponentRef<typeof Animated.View>, ViewProps>(function ThemeView({ style, ...props }, ref) {
  const transition = useThemeTransition();
  return <Animated.View {...props} ref={ref} style={[style, transition]} />;
});

export const Text = forwardRef<ComponentRef<typeof Animated.Text>, TextProps>(function ThemeText({ style, ...props }, ref) {
  const transition = useThemeTransition();
  return <Animated.Text {...props} ref={ref} style={[{ includeFontPadding: false }, style, transition, { transitionProperty: [...transition.transitionProperty, 'color'] }]} />;
});

const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);
export const Pressable = forwardRef<ComponentRef<typeof NativePressable>, PressableProps & { pressScale?: number }>(function ThemePressable({ style, pressScale, ...props }, ref) {
  const transition = useThemeTransition();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Reanimated needs a concrete style array; passing Pressable's style callback
  // through it discards the button's layout and fill on native.
  return <AnimatedPressable {...props} ref={ref}
    onPressIn={(event) => { setPressed(true); props.onPressIn?.(event); }}
    onPressOut={(event) => { setPressed(false); props.onPressOut?.(event); }}
    onHoverIn={(event) => { setHovered(true); props.onHoverIn?.(event); }}
    onHoverOut={(event) => { setHovered(false); props.onHoverOut?.(event); }}
    style={[typeof style === 'function' ? style({ pressed, hovered }) : style, transition,
      pressed && { transitionDuration: '0ms' },
      pressScale !== undefined && {
        transform: [{ scale: pressed && !reduceMotion() ? pressScale : 1 }],
        transitionProperty: [...transition.transitionProperty, 'transform'],
        transitionDuration: [...transition.transitionProperty.map(() => pressed ? '0ms' : transition.transitionDuration), reduceMotion() ? '0ms' : '110ms'],
      },
    ]}
  />;
});

const AnimatedInput = Animated.createAnimatedComponent(NativeTextInput);
export const TextInput = forwardRef<ComponentRef<typeof NativeTextInput>, TextInputProps>(function ThemeInput({ style, ...props }, ref) {
  const transition = useThemeTransition();
  return <AnimatedInput {...props} ref={ref} style={[style, transition, { transitionProperty: [...transition.transitionProperty, 'color'] }]} />;
});
