import { useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from '@/components/themeMotion';
import AppIcon from '@/components/Icon';
import { Button, Group } from '@/components/ui';
import { restartIntoUpdate } from '@/appUpdate';
import { getUpdateLater, setUpdateLater } from '@/settings';
import { showUpdateCard } from '@/updateCard';
import { colors, RADIUS, TYPE, themed } from '@/theme';
import { todayYmd } from '@/warranty';

// iOS 27 Liquid Glass update card: glass styling, concentric radius, smooth dismissal.
export function UpdateCard({ pending }: { pending: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [laterDay, setLaterDay] = useState(getUpdateLater);
  const [busy, setBusy] = useState(false);
  const [anim] = useState(() => new Animated.Value(1));

  if (!showUpdateCard(pending, laterDay, todayYmd())) return null;

  const later = () => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      const today = todayYmd();
      setUpdateLater(today);
      setLaterDay(today);
    });
  };
  const restart = () => {
    setBusy(true);
    restartIntoUpdate().catch(() => setBusy(false));
  };

  return (
    <Animated.View style={{ opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
      <Group style={styles.card} accessibilityLiveRegion="polite">
        <View style={styles.header}>
          <View style={styles.tile} importantForAccessibility="no-hide-descendants">
            <AppIcon name="arrow-up" size={18} color={colors.tintInk} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title} accessibilityRole="header">{t('home.updateTitle')}</Text>
            <Text style={styles.body}>{t('home.updateBody')}</Text>
          </View>
        </View>
        <View style={styles.buttons}>
          <Button title={t('home.updateLater')} kind="glass" onPress={later} style={styles.button} disabled={busy} />
          <Button title={t('home.updateRestart')} onPress={restart} style={styles.button} busy={busy} />
        </View>
      </Group>
    </Animated.View>
  );
}

const useStyles = themed(() => StyleSheet.create({
  card: {
    marginTop: 8,
    padding: 16,
    gap: 14,
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.tintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  text: { flex: 1, gap: 2 },
  title: { ...TYPE.headline, color: colors.ink },
  body: { ...TYPE.sub, color: colors.ink2 },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 },
}));
