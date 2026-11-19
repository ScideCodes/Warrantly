import { Pressable, Text, TextInput, View, reduceMotion, useThemeTransition } from '@/components/themeMotion';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AppIcon, { type IconName } from '@/components/Icon';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable as NativePressable,
  StyleSheet,
  useWindowDimensions,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
  type LayoutRectangle,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { GlassFill } from '@/components/GlassFill';
import { colors, CONTROL_H, EASE, FIELD_RADIUS, RADIUS, ROW_H, ROW_PAD, ROW_X, PRESS_DELAY, SEP_ICON, SPRING, SPRING_BOUNCE, TYPE, themed } from '@/theme';
import { segmentedLayout } from '@/segmentedLayout';
import { springAt, type SpringConfig } from '@/spring';

// The bencepc.hu controls as React Native components. Values and their sources: docs/visual-reference.md.
export type { IconName } from '@/components/Icon';
const ease = Easing.bezier(...EASE);

// Shared accessibility preference also controls theme colour transitions.
export { reduceMotion } from '@/components/themeMotion';

// The host side of a glass element: transparent, with the outer edge and drop shadow. The material and the
// element's content go in a <GlassFill> child (see there for why the content must be inside it).
export const glass = (): ViewStyle => ({ backgroundColor: 'transparent', boxShadow: colors.glassEdge });

// True inside a Modal window (a sheet): the lens there has no backdrop to sample, so glass controls draw the solid
// material with the same rim and sheen. That is also what iOS shows: glass over a sheet's flat background refracts
// only that flat colour, so its close button reads as a plain light-grey (dark: graphite) disc with a bright rim.
export const SolidGlass = createContext(false);

// A native-driver spring that keeps the velocity of the spring it interrupts. React Native restarts a retargeted
// spring from rest, so a sheet closed while still rising stopped dead and fell back; Apple's springs carry their
// velocity into the new target (WWDC23 "Animate with springs"), so it curves round instead. The velocity comes from
// the same closed form the UI thread runs (src/spring.ts); JS only touches the value when a target changes.
// `from` and `velocity` describe the start when no spring of ours is running (first use, after stopSpring).
type Run = { from: number; to: number; v: number; at: number; c: SpringConfig };
const runs = new WeakMap<Animated.Value, Run>();
export function springTo(value: Animated.Value, to: number, c: SpringConfig, o: { from?: number; velocity?: number; done?: () => void; rest?: { restDisplacementThreshold: number; restSpeedThreshold: number } } = {}): void {
  const run = runs.get(value);
  const now = Date.now();
  const s = run ? springAt(run.c, run.from, run.to, run.v, (now - run.at) / 1000) : { x: o.from ?? to, v: o.velocity ?? 0 };
  runs.set(value, { from: s.x, to, v: s.v, at: now, c });
  value.stopAnimation(); // otherwise React Native seeds the new spring with the old one's starting velocity
  Animated.spring(value, { toValue: to, velocity: s.v, useNativeDriver: true, ...c, ...o.rest }).start(({ finished }) => finished && o.done?.());
}
// Stops the value where it is and forgets its spring: for a drag or setValue taking over.
export function stopSpring(value: Animated.Value, done?: (at: number) => void): void {
  runs.delete(value);
  value.stopAnimation(done);
}

// Interactive Liquid Glass (SwiftUI `.glassEffect(.regular.interactive())` and the glass button styles): a touch
// swells the element a few dp and lights it from within, starting under the finger and spreading over the surface,
// the light following the finger; release settles it on the bouncy spring, so it dips just under its size once.
// Apple: "Glass reacts to user interaction by scaling, bouncing, and shimmering" (WWDC25 "Build a SwiftUI app with
// the new design"); "the material illuminates from within ... starting right under your fingertips" ("Meet Liquid
// Glass"). All of it runs on the native driver. Reduce Motion keeps the light and drops the swell and the bounce
// (Apple: it "disables any elastic properties"). Put `light` first inside the GlassFill, under the content, and
// `touch` last, over it, so touches report positions in the element's own frame.
const PRESS_SPRING = { stiffness: 1153, damping: 42.1, mass: 1 }; // the bounce spring compressed into .22 s
const SWELL = 4.4; // dp a pressed element grows by (1.1 on a 44dp button), at most 10 %
const GLOW = 48; // radius of the light under the finger
export function useGlassPress() {
  const [g] = useState(() => {
    const p = new Animated.Value(0);
    const swell = new Animated.Value(0);
    return {
      p,
      swell,
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      scale: Animated.add(1, Animated.multiply(p, swell)),
      light: p.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      spread: p.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1], extrapolate: 'clamp' }),
    };
  });
  const size = useRef(CONTROL_H);
  const follow = (e: GestureResponderEvent) => {
    g.x.setValue(e.nativeEvent.locationX);
    g.y.setValue(e.nativeEvent.locationY);
  };
  return {
    scale: g.scale,
    onPressIn: (e: GestureResponderEvent) => {
      follow(e);
      g.swell.setValue(reduceMotion() ? 0 : Math.min(0.1, SWELL / size.current));
      springTo(g.p, 1, PRESS_SPRING, { from: 0 });
    },
    onPressOut: () => springTo(g.p, 0, SPRING_BOUNCE),
    light: (
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassWash, opacity: g.light }]}>
        <Animated.View
          style={{
            position: 'absolute', left: -GLOW, top: -GLOW, width: 2 * GLOW, height: 2 * GLOW,
            backgroundImage: `radial-gradient(circle, ${colors.glassGlow}, transparent 70%)`,
            transform: [{ translateX: g.x }, { translateY: g.y }, { scale: g.spread }],
          }}
        />
      </Animated.View>
    ),
    touch: (
      <View
        style={StyleSheet.absoluteFill}
        collapsable={false} // a real view, so it is the touch target and locations are in its (the element's) frame
        accessible={false}
        importantForAccessibility="no"
        onLayout={(e) => (size.current = Math.max(1, e.nativeEvent.layout.width, e.nativeEvent.layout.height))}
        onTouchMove={follow}
      />
    ),
  };
}

type ButtonKind = 'prominent' | 'glass' | 'destructive';
// Capsule buttons: Glass Prominent (accent) and Glass (material, label colour). 44 tall; the hit area reaches 48.
export function Button({
  title,
  onPress,
  kind = 'prominent',
  icon,
  disabled,
  busy,
  style,
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const prominent = kind === 'prominent';
  const ink = disabled ? colors.ink2 : prominent ? colors.onAccent : kind === 'destructive' ? colors.bad : colors.ink;
  const glassy = kind === 'glass' && !disabled;
  const press = useGlassPress();
  const solid = useContext(SolidGlass);
  const content = (
    <>
      {busy ? <ActivityIndicator size="small" color={ink} /> : icon ? <AppIcon name={icon} size={20} color={ink} /> : null}
      <Text style={[styles.buttonText, { color: ink }]}>{title}</Text>
    </>
  );
  return (
    <Pressable
      unstable_pressDelay={PRESS_DELAY}
      testID={testID}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled || busy}
      hitSlop={4}
      style={({ pressed }) => [
        glassy ? styles.glassHost : styles.button,
        prominent
          ? { backgroundColor: pressed ? colors.accentDown : colors.accent, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' }
          : glass(),
        (disabled || kind === 'destructive') && { backgroundColor: colors.fill, boxShadow: undefined, backgroundImage: undefined, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
        busy && styles.disabled,
        style,
        { transform: [{ scale: press.scale }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
    >
      {glassy ? (
        <>
          {/* Sizes the host. The lens below fills it absolutely, so no flex growth can stretch it. */}
          <View style={[styles.button, styles.sizer]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {content}
          </View>
          <GlassFill radius={CONTROL_H / 2} style={styles.button} solid={solid}>
            {press.light}
            {content}
            {press.touch}
          </GlassFill>
        </>
      ) : (
        content
      )}
    </Pressable>
  );
}

// Round 44dp glass button for bars and sheet toolbars: label-coloured glyph, interactive glass (swells to 1.1).
export function GlassButton({ icon, label, onPress, size = 20, color = colors.ink, testID, disabled, selected }: { icon: IconName; label: string; onPress: () => void; size?: number; color?: string; testID?: string; disabled?: boolean; selected?: boolean }) {
  const styles = useStyles();
  const press = useGlassPress();
  const solid = useContext(SolidGlass);
  return (
    <Animated.View style={[{ transform: [{ scale: press.scale }] }, disabled && { opacity: 0.4 }]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={disabled}
        hitSlop={4}
        style={[styles.round, glass()]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled, selected }}
      >
        <GlassFill radius={CONTROL_H / 2} style={styles.center} solid={solid}>
          {press.light}
          <AppIcon name={icon} size={size} color={color} />
          {press.touch}
        </GlassFill>
      </Pressable>
    </Animated.View>
  );
}

// Section header above a group: Prominent title, primary label colour, 20 above and 6 below.
export function SectionHeader({ title, first, trailing }: { title: string; first?: boolean; trailing?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={[styles.sectionHead, first && { marginTop: 8 }]}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {trailing}
    </View>
  );
}

// A grouped card: opaque, 26 radius, clips its rows. In a sheet the dark card is one step lighter.
export function Group({ children, style, inSheet, ...rest }: ViewProps & { inSheet?: boolean }) {
  const styles = useStyles();
  return (
    <View {...rest} style={[styles.group, inSheet && { backgroundColor: colors.sheetGroup }, style]}>
      {children}
    </View>
  );
}

// The row press: --press at once, fading back over .3 s on the ease-out.
function usePressOpacity() {
  const v = useState(() => new Animated.Value(0))[0];
  return {
    opacity: v,
    onPressIn: () => {
      v.stopAnimation();
      v.setValue(1);
    },
    onPressOut: () => Animated.timing(v, { toValue: 0, duration: reduceMotion() ? 0 : 300, easing: ease, useNativeDriver: true }).start(),
  };
}

// One row in a group: 46 minimum, 11/16 padding, Body text. `separator` draws the 1px line above it, inset 16
// at both ends (or from 59 after an icon tile). `chevron` marks rows that open something.
export function Row({
  children,
  onPress,
  onLongPress,
  separator,
  iconInset,
  chevron,
  selected,
  style,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
  testID,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  separator?: boolean;
  iconInset?: boolean;
  chevron?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: PressableProps['accessibilityRole'];
  accessibilityLabel?: string;
  accessibilityState?: PressableProps['accessibilityState'];
  testID?: string;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const press = usePressOpacity();
  const body = (
    <>
      {separator && <View style={[styles.separator, { left: iconInset ? SEP_ICON : ROW_X }]} />}
      {children}
      {chevron && <Chevron />}
    </>
  );
  if (!onPress) return <View style={[styles.row, selected && styles.rowSelected, style]}>{body}</View>;
  return (
    <NativePressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      unstable_pressDelay={PRESS_DELAY}
      disabled={disabled}
      style={[styles.row, selected && styles.rowSelected, disabled && styles.disabled, style]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled, ...accessibilityState }}
    >
      {/* Animate only a non-interactive overlay. Driving the touch surface's background with both
          Animated and theme CSS transitions made row holds and nested document buttons flash. */}
      <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.press, opacity: press.opacity }]} />
      {body}
    </NativePressable>
  );
}

export function Chevron() {
  const styles = useStyles();
  return <AppIcon name="chevron-forward" size={14} color={colors.chevron} style={styles.chevron} />;
}

// 29dp rounded tile with a white 18dp glyph (settings and hardware rows).
export function IconTile({ name, color, glyph = '#fff' }: { name: IconName; color: string; glyph?: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.tile, { backgroundColor: color }]} importantForAccessibility="no-hide-descendants">
      <AppIcon name={name} size={18} color={glyph} />
    </View>
  );
}
// The reference's tile colours (ios.css line 288).
export const TILE = { blue: '#007aff', orange: '#ff9500', green: '#34c759', grey: '#8e8e93', purple: '#af52de', teal: '#30b0c7', yellow: '#ffcc00', indigo: '#5856d6', cyan: '#5ac8fa', red: '#ff3b30' } as const;

// Text field: 44 tall, 9/12 padding, 14 radius, filled with --card-2; focus draws a 2dp tint ring.
export function Input({ style, inSheet, ...props }: TextInputProps & { inSheet?: boolean }) {
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.ink2}
      selectionColor={colors.tint}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[styles.input, inSheet && { backgroundColor: colors.sheetField }, focused && styles.inputFocus, style]}
    />
  );
}
// A function, not a constant: it reads the live palette (a constant would keep the colours from start-up).
export const inputStyle = (): TextStyle => ({ minHeight: CONTROL_H, paddingVertical: 9, paddingHorizontal: 12, borderRadius: FIELD_RADIUS, backgroundColor: colors.card2, color: colors.ink, ...TYPE.body });

// iOS 27 switch: 64 x 28 track, 38 x 24 white knob 2dp in, 22dp travel on the spring; drawn in a 44dp hit area.
export function Switch({ value, onValueChange, accessibilityLabel, disabled }: { value: boolean; onValueChange: (v: boolean) => void; accessibilityLabel?: string; disabled?: boolean }) {
  const styles = useStyles();
  const knob = useState(() => new Animated.Value(value ? 1 : 0))[0];
  const track = useState(() => new Animated.Value(value ? 1 : 0))[0];
  useEffect(() => {
    if (reduceMotion()) {
      knob.setValue(value ? 1 : 0);
      track.setValue(value ? 1 : 0);
      return;
    }
    Animated.spring(knob, { toValue: value ? 1 : 0, useNativeDriver: true, ...SPRING }).start();
    Animated.timing(track, { toValue: value ? 1 : 0, duration: 250, easing: ease, useNativeDriver: false }).start();
  }, [value, knob, track]);
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      style={[styles.switchHit, disabled && styles.disabled]}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View style={[styles.switchTrack, { backgroundColor: track.interpolate({ inputRange: [0, 1], outputRange: [colors.switchOff, colors.switchOn] }) }]}>
        <Animated.View style={[styles.switchKnob, { transform: [{ translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }] }]} />
      </Animated.View>
    </Pressable>
  );
}

// Stable touch targets with a separate selection lens; whole options reflow at large text sizes.
export function Segmented<K extends string>({ options, value, onChange, large }: { options: { key: K; label: string; icon?: IconName }[]; value: K; onChange: (k: K) => void; large?: boolean }) {
  const styles = useStyles();
  const transition = useThemeTransition();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [rects, setRects] = useState<Record<string, LayoutRectangle>>({});
  // Each label's own width, laid out bold off screen: the letter-count estimate stacks short labels
  // on narrow phones. Keyed by label so a language switch re-measures.
  const [textWidths, setTextWidths] = useState<Record<string, number>>({});
  const labels = options.map((o) => o.label);
  const measured = labels.every((l) => textWidths[`${fontScale}:${l}`] !== undefined)
    ? Math.max(...labels.map((l) => textWidths[`${fontScale}:${l}`] ?? 0)) : undefined;
  const { columns, optionWidth, icons } = segmentedLayout(width, fontScale, labels, large, measured);
  const selected = rects[value];
  // Only the decorative lens moves; touch targets, text and the grid stay still.
  // Recreate the lens when text/width reflows so resizing never sweeps over the UI.
  const layoutKey = `${width}:${fontScale}:${columns}:${large}`;
  return (
    <View style={[styles.seg, large && styles.segLarge]} accessibilityRole="radiogroup" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {selected && (
        <Reanimated.View key={layoutKey} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
          testID="segmented-selection"
          style={[styles.segLens, large && styles.segLensLarge, {
            width: selected.width, height: selected.height,
            transform: [{ translateX: selected.x }, { translateY: selected.y }],
            transitionProperty: ['transform', 'backgroundColor'],
            transitionDuration: transition.transitionDuration === '0ms' ? '0ms' : '180ms',
            transitionTimingFunction: 'ease-out',
          }]} />
      )}
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.segMeasure}>
        {labels.map((l) => (
          <Text key={l} style={[styles.segText, { fontWeight: '600', flexShrink: 0 }]}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              const k = `${fontScale}:${l}`;
              setTextWidths((prev) => (prev[k] === w ? prev : { ...prev, [k]: w }));
            }}>{l}</Text>
        ))}
      </View>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <NativePressable
            key={o.key}
            onPress={() => { if (!on) onChange(o.key); }}
            unstable_pressDelay={PRESS_DELAY}
            onLayout={(event) => {
              const rect = event.nativeEvent.layout;
              setRects((previous) => {
                const old = previous[o.key];
                return old && old.x === rect.x && old.y === rect.y && old.width === rect.width && old.height === rect.height
                  ? previous : { ...previous, [o.key]: rect };
              });
            }}
            style={({ pressed }) => [styles.segOption, large && styles.segOptionLarge, optionWidth !== undefined && { flex: 0, width: optionWidth }, columns < options.length && { minHeight: 44 }, pressed && { opacity: 0.72 }, !selected && on && styles.segOn]}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on }}
          >
            {o.icon && icons && <AppIcon name={o.icon} size={17} color={colors.ink} />}
            <Text style={[styles.segText, on && { fontWeight: '600' }]} numberOfLines={1}>
              {o.label}
            </Text>
          </NativePressable>
        );
      })}
    </View>
  );
}

const useStyles = themed(() => StyleSheet.create({
  disabled: { opacity: 0.45 },
  button: { minHeight: CONTROL_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: CONTROL_H / 2 },
  buttonText: { ...TYPE.button, textAlign: 'center', flexShrink: 1 },
  glassHost: { borderRadius: CONTROL_H / 2 },
  sizer: { opacity: 0 },
  round: { width: CONTROL_H, height: CONTROL_H, borderRadius: CONTROL_H / 2 },
  center: { alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 24, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { ...TYPE.section, color: colors.ink, flexShrink: 1, minWidth: 0 },
  group: { backgroundColor: colors.card, borderRadius: RADIUS, overflow: 'hidden' },
  row: { minHeight: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: ROW_PAD, paddingHorizontal: ROW_X },
  rowSelected: { backgroundColor: colors.tintSoft },
  separator: { position: 'absolute', top: 0, right: ROW_X, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  chevron: { marginLeft: 'auto' },
  tile: { width: 29, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  input: inputStyle(),
  inputFocus: { outlineWidth: 2, outlineColor: colors.tint, outlineStyle: 'solid' },
  switchHit: { width: 64, minHeight: CONTROL_H, justifyContent: 'center' },
  switchTrack: { width: 64, height: 28, borderRadius: 14 },
  switchKnob: { position: 'absolute', top: 2, left: 2, width: 38, height: 24, borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.04)' },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 2, borderRadius: 16, backgroundColor: colors.fill },
  segLarge: { borderRadius: 22 },
  segOption: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 14 },
  segOptionLarge: { minHeight: 40, paddingHorizontal: 8, borderRadius: 20 },
  segOn: { backgroundColor: colors.segOn, boxShadow: colors.segShadow },
  segLens: { position: 'absolute', top: 0, left: 0, borderRadius: 14, backgroundColor: colors.segOn, boxShadow: colors.segShadow },
  segLensLarge: { borderRadius: 20 },
  segMeasure: { position: 'absolute', left: 0, top: 0, opacity: 0, alignItems: 'flex-start' },
  segText: { ...TYPE.seg, color: colors.ink, textAlign: 'center', flexShrink: 1 },
}));
