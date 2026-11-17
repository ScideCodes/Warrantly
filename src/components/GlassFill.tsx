import { useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LiquidGlassView } from '@sbaiahmed1/react-native-blur';
import { getGlassEnabled, setGlassEnabled } from '@/settings';
import { colors, SHEEN, useTheme } from '@/theme';

// Settings > Liquid Glass. Off turns every glass surface into the solid material colour, live.
// Read on first use, not at import: settings.ts sits in an import cycle with the UI modules.
let enabled: boolean | undefined;
const listeners = new Set<() => void>();
export function setGlass(on: boolean): void {
  setGlassEnabled(on);
  enabled = on;
  listeners.forEach((l) => l());
}
export const useGlassEnabled = (): boolean =>
  useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => (enabled ??= getGlassEnabled()));

type Props = {
  radius: number;
  children?: ReactNode;
  // Layout for the content. The surface fills its host unless `flow`, where it sits in the host's layout instead
  // (content-sized hosts: capsule buttons, the alert, the undo bar, the tab bar).
  style?: StyleProp<ViewStyle>;
  flow?: boolean;
  sheen?: boolean;
  // Pressed or selected tint over the material, under the content. A host background would sit under the lens.
  highlight?: string | false;
  // No lens even when glass is on, for a host in its own Modal window, where the lens has nothing to sample.
  solid?: boolean;
};

// The iOS 27 Liquid Glass material. Live part: the native lens (backdrop blur, edge refraction, dispersion, tint;
// AGSL shader on Android 13+, a tinted blur below). Static part: the specular rim and sheen, which do not depend
// on the backdrop. The element's content goes INSIDE as children: the lens captures the window behind it and skips
// only its own subtree, so content beside it would be refracted into its own backdrop as a blurred ghost.
// The host keeps the outer edge and drop shadow (`glass()` in ui.tsx) and must have no fill of its own.
export function GlassFill({ radius, children, style, flow, sheen = true, highlight, solid = false }: Props) {
  useTheme();
  const on = useGlassEnabled() && !solid;
  const box = [!flow && StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' as const }, style];
  const surface = (
    <>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, boxShadow: colors.glassRim },
          sheen && { backgroundImage: SHEEN.replace('0.5)', `${0.5 * colors.glassSheen})`) },
        ]}
      />
      {highlight ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: highlight }]} /> : null}
      {children}
    </>
  );
  return on ? (
    <LiquidGlassView
      glassType="regular"
      glassTintColor={colors.glassTint}
      glassOpacity={colors.glassTintOpacity}
      isInteractive={false}
      pointerEvents="box-none"
      style={box}
    >
      {surface}
    </LiquidGlassView>
  ) : (
    <View pointerEvents="box-none" style={[box, { backgroundColor: colors.material }]}>
      {surface}
    </View>
  );
}
