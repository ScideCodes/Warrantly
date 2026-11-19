import { Pressable, Text, View } from '@/components/themeMotion';
import { useEffect, useState } from 'react';
import { Animated, BackHandler, Easing, Modal, ScrollView, StyleSheet, useWindowDimensions, type AlertButton } from 'react-native';
import i18n from '@/i18n';
import { colors, EASE, TYPE, themed, wordWidth } from '@/theme';
import { reduceMotion } from '@/components/ui';
import { GlassFill } from '@/components/GlassFill';
import { isSheetOpen } from '@/components/Sheet';
import { isLocked, useLocked } from '@/lock/gate';

// The reference's alert (`.link-alert`, ios.css lines 567-583): centred title and message, capsule actions,
// opening with opacity 0 -> 1 and scale .96 -> 1 over .2 s, and leaving the same way in .15 s (iOS fades an
// answered alert out rather than cutting it). `showAlert` takes the same arguments as
// React Native's Alert.alert, so every existing call keeps its buttons and callbacks.
// `locked`: asked for while the lock showed, so by the lock screen; the app's own alerts wait behind the lock.
type Request = { title: string; message?: string; buttons: AlertButton[]; cancelable: boolean; locked: boolean };
let queue: Request[] = [];
let notify: (() => void) | null = null;

export function showAlert(title: string, message?: string, buttons?: AlertButton[], options?: { cancelable?: boolean }): void {
  queue = [...queue, { title, message, buttons: buttons?.length ? buttons : [{ text: i18n.t('dialog.ok') }], cancelable: options?.cancelable ?? true, locked: isLocked() }];
  notify?.();
}

export function DialogHost() {
  const styles = useStyles();
  const [, setVersion] = useState(0);
  const { width, fontScale } = useWindowDimensions();
  const anim = useState(() => new Animated.Value(0))[0];
  const locked = useLocked();
  const current = queue.find((r) => !locked || r.locked) ?? null;
  // The answered alert, drawn while it fades out; inert. Keeps the window it was answered in.
  const [leaving, setLeaving] = useState<{ request: Request; overSheet: boolean } | null>(null);
  useEffect(() => {
    notify = () => setVersion((n) => n + 1);
    return () => {
      notify = null;
    };
  }, []);
  useEffect(() => {
    if (!current) return;
    anim.setValue(reduceMotion() ? 1 : 0);
    Animated.timing(anim, { toValue: 1, duration: 200, easing: Easing.bezier(...EASE), useNativeDriver: true }).start();
  }, [current, anim]);

  const finish = (b?: AlertButton) => {
    const request = current;
    queue = queue.filter((r) => r !== current);
    setVersion((n) => n + 1);
    if (request && !reduceMotion()) {
      const ghost = { request, overSheet: isSheetOpen() && !locked };
      setLeaving(ghost);
      Animated.timing(anim, { toValue: 0, duration: 150, easing: Easing.bezier(...EASE), useNativeDriver: true }).start(() => setLeaving((l) => (l === ghost ? null : l)));
    }
    b?.onPress?.();
  };
  const cancel = () => {
    if (!current?.cancelable && !current?.buttons.some((b) => b.style === 'cancel')) return;
    finish(current?.buttons.find((b) => b.style === 'cancel'));
  };
  useEffect(() => {
    if (!current) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel();
      return true;
    });
    return () => sub.remove();
  });
  const shown = current ?? leaving?.request;
  if (!shown) return null;
  // Cancel first, the action last: the reference puts the prominent action on the trailing side.
  const buttons = [...shown.buttons].sort((a, b) => (a.style === 'cancel' ? -1 : b.style === 'cancel' ? 1 : 0));
  // The glass lens only sees views in its own window, so the alert is an in-window overlay (DialogHost is the
  // last child of the root). Over a sheet, which is its own Modal window, it must be a Modal too: solid there.
  // While locked the sheets are hidden and a Modal would float over the lock screen: in-window, like its own alerts.
  const overSheet = current ? isSheetOpen() && !locked : !!leaving?.overSheet;
  const body = (
    <View style={StyleSheet.absoluteFill} pointerEvents={current ? 'auto' : 'none'} importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}>
      <Animated.View style={[styles.scrim, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessible={false} />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[styles.alert, { width: Math.min(300, width - 32), opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <GlassFill flow radius={34} solid={overSheet} style={styles.shrink}>
            <ScrollView bounces={false} contentContainerStyle={styles.content}>
              <View style={styles.copy}>
                <Text style={styles.title} accessibilityRole="header">
                  {shown.title}
                </Text>
                {shown.message ? <Text style={styles.message}>{shown.message}</Text> : null}
              </View>
              <View style={styles.actions}>
                {buttons.map((b, i) => {
                  const primary = b.style !== 'cancel' && i === buttons.length - 1 && b.style !== 'destructive';
                  return (
                    <Pressable
                      key={i}
                      onPress={() => finish(b)}
                      style={({ pressed }) => [
                        styles.action,
                        // two to a row only while the longest word fits; otherwise the button takes its own row
                        { flexBasis: Math.max(96, wordWidth(b.text ?? '', 17) * fontScale + 24) },
                        { backgroundColor: primary ? colors.accent : colors.fill },
                        pressed && !reduceMotion() && { transform: [{ scale: 0.97 }] },
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.actionText, { color: primary ? colors.onAccent : b.style === 'destructive' ? colors.bad : colors.ink }]}>{b.text}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </GlassFill>
        </Animated.View>
      </View>
    </View>
  );
  return overSheet ? (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={cancel}>
      {body}
    </Modal>
  ) : (
    <View style={styles.overlay} pointerEvents={current ? 'auto' : 'none'}>{body}</View>
  );
}

const useStyles = themed(() => StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 1000 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.dim },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  alert: { maxHeight: '100%', borderRadius: 34, boxShadow: `${colors.glassEdge}, 0 16px 48px rgba(0,0,0,0.18)` },
  shrink: { flexShrink: 1 },
  content: { padding: 14 },
  copy: { paddingTop: 12, paddingHorizontal: 10, paddingBottom: 18 },
  title: { ...TYPE.headline, letterSpacing: -0.26, color: colors.ink, textAlign: 'center' },
  message: { ...TYPE.foot, color: colors.ink, textAlign: 'center', marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1, flexShrink: 1, flexBasis: 96, minWidth: 0, minHeight: 48, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actionText: { ...TYPE.button, textAlign: 'center' },
}));
