import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { FlatList, Image, StyleSheet, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useSharedValue, withDecay } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import type { PdfPage } from '../../modules/pdf-pages';
import { bound, MAX_ZOOM, MIN_ZOOM, maxPdfScroll, zoomPosition } from '@/pdfViewport';
import { reduceMotion } from '@/components/themeMotion';

export type PdfCanvasHandle = { zoomTo: (scale: number) => void };

// Pages stay at their fit-width layout and remain virtualized. Only the viewport
// transform and native scroll offset move per frame, entirely on the UI thread.
export const PdfCanvas = forwardRef<PdfCanvasHandle, { pages: PdfPage[]; width: number; onZoom: (scale: number) => void }>(function PdfCanvas({ pages, width, onZoom }, ref) {
  const { t } = useTranslation();
  const [height, setHeight] = useState(1);
  const list = useAnimatedRef<FlatList<PdfPage>>();
  const layouts = useMemo(() => {
    let offset = 0;
    return pages.map((page, index) => {
      const length = width * page.height / page.width + 8;
      const layout = { index, offset, length };
      offset += length;
      return layout;
    });
  }, [pages, width]);
  const last = layouts.at(-1);
  const contentHeight = last ? last.offset + last.length : 0;
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const pinching = useSharedValue(false);
  const startScale = useSharedValue(1);
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const singleFingerPan = useSharedValue(false);
  const reduced = reduceMotion();

  useEffect(() => () => cancelAnimation(y), [y]);
  useEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      cancelAnimation(y);
      y.value = bound(y.value, 0, maxPdfScroll(contentHeight, height, scale.value));
    });
  }, [contentHeight, height, scale, y]);

  useAnimatedReaction(() => y.value, (offset) => scrollTo(list, 0, offset, false));
  const transform = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale: scale.value }],
  }));

  useImperativeHandle(ref, () => ({
    zoomTo(next) {
      scheduleOnUI(() => {
        'worklet';
        cancelAnimation(y);
        const position = zoomPosition(scale.value, next, x.value, y.value, width / 2, height / 2, width, height, contentHeight);
        scale.value = position.scale;
        x.value = position.x;
        y.value = position.y;
        scheduleOnRN(onZoom, position.scale);
      });
    },
  }), [contentHeight, height, onZoom, scale, width, x, y]);

  const pinch = usePinchGesture({
    onActivate: (event) => {
      'worklet';
      cancelAnimation(y);
      pinching.value = true;
      startScale.value = scale.value;
      anchorX.value = (event.focalX - x.value) / scale.value;
      anchorY.value = y.value + event.focalY / scale.value;
    },
    onUpdate: (event) => {
      'worklet';
      const next = bound(startScale.value * event.scale, MIN_ZOOM, MAX_ZOOM);
      scale.value = next;
      x.value = bound(event.focalX - anchorX.value * next, width * (1 - next), 0);
      y.value = bound(anchorY.value - event.focalY / next, 0, maxPdfScroll(contentHeight, height, next));
    },
    onFinalize: () => {
      'worklet';
      pinching.value = false;
      scheduleOnRN(onZoom, scale.value);
    },
  });
  const pan = usePanGesture({
    minDistance: 4,
    averageTouches: true,
    onActivate: () => {
      'worklet';
      cancelAnimation(y);
      panX.value = x.value;
      panY.value = y.value;
      singleFingerPan.value = false;
    },
    onUpdate: (event) => {
      'worklet';
      if (pinching.value || event.numberOfPointers !== 1) {
        singleFingerPan.value = false;
        // Rebase while two fingers are down so lifting one never jumps the page.
        panX.value = x.value - event.translationX;
        panY.value = y.value + event.translationY / scale.value;
        return;
      }
      singleFingerPan.value = true;
      x.value = bound(panX.value + event.translationX, width * (1 - scale.value), 0);
      y.value = bound(panY.value - event.translationY / scale.value, 0, maxPdfScroll(contentHeight, height, scale.value));
    },
    onDeactivate: (event) => {
      'worklet';
      if (singleFingerPan.value && !pinching.value && !reduced) {
        y.value = withDecay({ velocity: -event.velocityY / scale.value, clamp: [0, maxPdfScroll(contentHeight, height, scale.value)] });
      }
    },
  });
  const gesture = useSimultaneousGestures(pan, pinch);

  return (
    <GestureHandlerRootView style={styles.fill} onLayout={(event) => setHeight(Math.max(1, event.nativeEvent.layout.height))}>
      <GestureDetector gesture={gesture}>
        <View style={styles.viewport} collapsable={false} testID="pdf-canvas" accessible accessibilityRole="adjustable" accessibilityLabel={t('viewer.title')}
          accessibilityActions={[{ name: 'increment', label: t('viewer.scrollDown') }, { name: 'decrement', label: t('viewer.scrollUp') }]}
          onAccessibilityAction={(event) => {
            const direction = event.nativeEvent.actionName === 'increment' ? 1 : -1;
            y.value = bound(y.value + direction * height / scale.value, 0, maxPdfScroll(contentHeight, height, scale.value));
          }}>
          <Animated.View style={[styles.fill, { width, transformOrigin: 'top left' }, transform]}>
            <Animated.FlatList
              ref={list}
              data={pages}
              scrollEnabled={false}
              removeClippedSubviews={false}
              keyExtractor={(page) => page.uri}
              getItemLayout={(_, index) => layouts[index]}
              initialNumToRender={2}
              windowSize={5}
              // This spare native scroll range exposes the bottom of the last
              // page when scaled. Gesture bounds prevent showing the blank area.
              ListFooterComponent={<View style={{ height }} />}
              renderItem={({ item, index }) => <Image source={{ uri: item.uri }} style={[styles.page, { width, height: width * item.height / item.width }]} accessibilityLabel={t('viewer.page', { page: index + 1, count: pages.length })} />}
            />
          </Animated.View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  viewport: { flex: 1, overflow: 'hidden' },
  page: { marginBottom: 8, backgroundColor: '#fff' },
});
