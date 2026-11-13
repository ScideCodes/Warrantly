import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from '@/components/themeMotion';
import AppIcon from '@/components/Icon';
import { Button, Group, TILE } from '@/components/ui';
import { restartIntoUpdate } from '@/appUpdate';
import { getUpdateLater, setUpdateLater } from '@/settings';
import { showUpdateCard } from '@/updateCard';
import { colors, TYPE, themed } from '@/theme';
import { todayYmd } from '@/warranty';

// A downloaded app update, said plainly on the home list: what a restart does, Restart now or Later.
// The running app cannot read the new version's notes, so "What's new" explains them after the restart.
export function UpdateCard({ pending }: { pending: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [laterDay, setLaterDay] = useState(getUpdateLater);
  const [busy, setBusy] = useState(false);
  if (!showUpdateCard(pending, laterDay, todayYmd())) return null;

  const later = () => {
    const today = todayYmd();
    setUpdateLater(today);
    setLaterDay(today);
  };
  const restart = () => {
    setBusy(true);
    restartIntoUpdate().catch(() => setBusy(false));
  };

  return (
    <Group style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.top}>
        <View style={styles.tile} importantForAccessibility="no-hide-descendants">
          <AppIcon name="arrow-up" size={18} color="#fff" />
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
  );
}

const useStyles = themed(() => StyleSheet.create({
  card: { marginTop: 8, padding: 16, gap: 14 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tile: { width: 29, height: 29, borderRadius: 7, backgroundColor: TILE.blue, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { ...TYPE.headline, color: colors.ink },
  body: { ...TYPE.sub, color: colors.ink2 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { flexGrow: 1, flexBasis: 120 },
}));
