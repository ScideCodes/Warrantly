import { forwardRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Pressable as NativePressable,
  TextInput as NativeTextInput,
  View as NativeView,
  Text as NativeText,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native';

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

export function useThemeTransition() {
  const reduce = useSyncExternalStore(subscribe, reduceMotion, () => false);
  return {
    transitionProperty: ['backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'],
    transitionDuration: reduce ? '0ms' : '220ms',
    transitionTimingFunction: 'ease-out' as const,
  };
}

export const View = forwardRef<ComponentRef<typeof NativeView>, ViewProps>(function ThemeView({ style, ...props }, ref) {
  return <NativeView {...props} ref={ref} style={style} />;
});

export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function ThemeText({ style, ...props }, ref) {
  return <NativeText {...props} ref={ref} style={[{ includeFontPadding: false }, style]} />;
});

export const Pressable = forwardRef<ComponentRef<typeof NativePressable>, PressableProps & { pressScale?: number }>(function ThemePressable({ style, pressScale, ...props }, ref) {
  const [pressed, setPressed] = useState(false);
  const tracksPress = typeof style === 'function' || pressScale !== undefined;
  return (
    <NativePressable
      {...props}
      ref={ref}
      onPressIn={(event) => { if (tracksPress) setPressed(true); props.onPressIn?.(event); }}
      onPressOut={(event) => { if (tracksPress) setPressed(false); props.onPressOut?.(event); }}
      style={[
        typeof style === 'function' ? style({ pressed, hovered: false }) : style,
        pressScale !== undefined && pressed && !reduceMotion() && { transform: [{ scale: pressScale }] },
      ]}
    />
  );
});

export const TextInput = forwardRef<ComponentRef<typeof NativeTextInput>, TextInputProps>(function ThemeInput({ style, ...props }, ref) {
  return <NativeTextInput {...props} ref={ref} style={style} />;
});
