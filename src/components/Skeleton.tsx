import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { View, reduceMotion } from '@/components/themeMotion';
import { colors, RADIUS, ROW_H, ROW_PAD, ROW_X, SEP_ICON, themed } from '@/theme';
import { Group, SectionHeader } from '@/components/ui';

export function SkeletonBox({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width?: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const [opacity] = useState(() => new Animated.Value(reduceMotion() ? 0.55 : 0.38));

  useEffect(() => {
    if (reduceMotion()) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.72,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.38,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius, opacity },
        style,
      ]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function WarrantyRowSkeleton({ separator }: { separator?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {separator && <View style={[styles.separator, { left: SEP_ICON }]} />}
      <SkeletonBox width={29} height={29} borderRadius={7} />
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <SkeletonBox width="56%" height={15} borderRadius={7} />
          <SkeletonBox width={52} height={16} borderRadius={6} />
        </View>
        <SkeletonBox width="38%" height={12} borderRadius={6} style={{ marginTop: 2 }} />
      </View>
    </View>
  );
}

export function HomeListSkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.homeSkeleton} accessible accessibilityLabel="Loading">
      <View style={styles.summarySkeleton}>
        <SkeletonBox width="31%" height={34} borderRadius={RADIUS - 6} />
        <SkeletonBox width="31%" height={34} borderRadius={RADIUS - 6} />
        <SkeletonBox width="31%" height={34} borderRadius={RADIUS - 6} />
      </View>
      <Group>
        <WarrantyRowSkeleton />
        <WarrantyRowSkeleton separator />
        <WarrantyRowSkeleton separator />
        <WarrantyRowSkeleton separator />
        <WarrantyRowSkeleton separator />
      </Group>
    </View>
  );
}

export function WarrantyDetailSkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.detailSkeleton} accessible accessibilityLabel="Loading">
      <View style={styles.heroSkeleton}>
        <View style={styles.heroTop}>
          <SkeletonBox width={52} height={52} borderRadius={13} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBox width="68%" height={22} borderRadius={8} />
            <SkeletonBox width="38%" height={14} borderRadius={6} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <SkeletonBox width={85} height={20} borderRadius={7} />
          <SkeletonBox width={135} height={20} borderRadius={7} />
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <SectionHeader title="" />
        <Group>
          <View style={styles.fieldSkeleton}>
            <SkeletonBox width={36} height={36} borderRadius={8} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBox width="58%" height={14} borderRadius={6} />
              <SkeletonBox width="32%" height={11} borderRadius={5} />
            </View>
          </View>
        </Group>
      </View>

      <View style={{ marginTop: 16 }}>
        <SectionHeader title="" />
        <Group>
          {[60, 45, 75, 50, 65].map((w, i) => (
            <View key={i} style={[styles.fieldRow, i > 0 && styles.fieldBorder]}>
              <SkeletonBox width="32%" height={13} borderRadius={6} />
              <SkeletonBox width={`${w}%`} height={13} borderRadius={6} />
            </View>
          ))}
        </Group>
      </View>
    </View>
  );
}

export function BackupStatusSkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.cardSkeleton} accessible accessibilityLabel="Loading">
      <Group>
        <View style={[styles.fieldRow, { paddingVertical: 18 }]}>
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBox width="45%" height={18} borderRadius={8} />
            <SkeletonBox width="70%" height={13} borderRadius={6} />
          </View>
          <SkeletonBox width={64} height={28} borderRadius={14} />
        </View>
        <View style={[styles.fieldRow, styles.fieldBorder]}>
          <SkeletonBox width="35%" height={13} borderRadius={6} />
          <SkeletonBox width="40%" height={13} borderRadius={6} />
        </View>
      </Group>
    </View>
  );
}

export function TransferSkeleton() {
  const styles = useStyles();
  return (
    <View style={{ gap: 16, marginTop: 8 }} accessible accessibilityLabel="Loading">
      <SkeletonBox width="85%" height={14} borderRadius={6} style={{ marginHorizontal: ROW_X }} />
      <Group>
        {[1, 2, 3].map((n, i) => (
          <View key={n} style={[styles.fieldRow, i > 0 && styles.fieldBorder]}>
            <SkeletonBox width={22} height={22} borderRadius={11} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBox width="65%" height={14} borderRadius={6} />
              <SkeletonBox width="35%" height={11} borderRadius={5} />
            </View>
          </View>
        ))}
      </Group>
    </View>
  );
}

const useStyles = themed(() => StyleSheet.create({
  skeleton: {
    backgroundColor: colors.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: ROW_H,
    paddingVertical: ROW_PAD,
    paddingHorizontal: ROW_X,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  separator: {
    position: 'absolute',
    top: 0,
    right: ROW_X,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  homeSkeleton: {
    gap: 12,
    marginTop: 4,
  },
  summarySkeleton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 4,
    borderRadius: RADIUS,
    backgroundColor: colors.card,
  },
  detailSkeleton: {
    gap: 12,
  },
  heroSkeleton: {
    gap: 10,
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: ROW_X,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: ROW_H,
    paddingVertical: ROW_PAD,
    paddingHorizontal: ROW_X,
  },
  fieldBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  cardSkeleton: {
    gap: 16,
  },
}));
