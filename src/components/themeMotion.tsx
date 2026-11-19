import { forwardRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable as NativePressable,
  TextInput as NativeTextInput,
  View as NativeView,
  Text as NativeText,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import type { CSSTransitionProperties } from 'react-native-reanimated';

// One preference listener for the app, including changes made while it is open.
let reduced = false;
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

// Reanimated 4 CSS transition props: they only animate on a Reanimated component (Reanimated.View, createAnimatedComponent).
export function useThemeTransition(): CSSTransitionProperties<ViewStyle> {
  const reduce = useSyncExternalStore(subscribe, reduceMotion, () => false);
  return {
    transitionProperty: ['backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'],
    transitionDuration: reduce ? '0ms' : '220ms',
    transitionTimingFunction: 'ease-out',
  };
}

export const View = forwardRef<ComponentRef<typeof NativeView>, ViewProps>(function ThemeView({ style, ...props }, ref) {
  return <NativeView {...props} ref={ref} style={style} />;
});

export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function ThemeText({ style, ...props }, ref) {
  return <NativeText {...props} ref={ref} style={[{ includeFontPadding: false }, style]} />;
});

const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);

// pressScale runs on the UI thread (native driver) so a native glass lens inside the button scales in the same frame
// as its label and edge. A state-driven transform reached the screen a JS round trip later, which showed as the
// glass material and text trailing the button.
export const Pressable = forwardRef<ComponentRef<typeof NativePressable>, PressableProps & { pressScale?: number }>(function ThemePressable({ style, pressScale, ...props }, ref) {
  const [pressed, setPressed] = useState(false);
  const scale = useState(() => new Animated.Value(1))[0];
  const tracksPress = typeof style === 'function';
  const to = (value: number, duration: number) => {
    if (pressScale === undefined || reduceMotion()) return;
    Animated.timing(scale, { toValue: value, duration, useNativeDriver: true }).start();
  };
  return (
    <AnimatedPressable
      {...props}
      ref={ref}
      onPressIn={(event) => { if (tracksPress) setPressed(true); to(pressScale ?? 1, 100); props.onPressIn?.(event); }}
      onPressOut={(event) => { if (tracksPress) setPressed(false); to(1, 140); props.onPressOut?.(event); }}
      style={[
        typeof style === 'function' ? style({ pressed }) : style,
        pressScale !== undefined && { transform: [{ scale }] },
      ]}
    />
  );
});

export const TextInput = forwardRef<ComponentRef<typeof NativeTextInput>, TextInputProps>(function ThemeInput({ style, ...props }, ref) {
  return <NativeTextInput {...props} ref={ref} style={style} />;
});
