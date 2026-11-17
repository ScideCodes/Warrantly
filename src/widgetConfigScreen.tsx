import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { useTranslation } from 'react-i18next';
import { Text, View } from '@/components/themeMotion';
import { Button, Group, Row, Segmented, Switch } from '@/components/ui';
import { getDb } from '@/db/client';
import { isLockEnabled, verifyDeviceOwner } from '@/lock/store';
import { setWidgetConfigText } from '@/settings';
import { colors, TYPE, themed } from '@/theme';
import { renderFor, widgetConfig } from '@/widget';
import type { WidgetConfig, WidgetNames } from '@/widgetModel';

// Shown by Android when a widget is placed, and from its "reconfigure" option (shortlist 27). Each widget
// keeps its own choices; the preview on the home screen updates as they change.
export function WidgetConfigScreen({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<WidgetConfig>(() => widgetConfig(widgetInfo.widgetId));
  useEffect(() => {
    void getDb().then((db) => renderFor(db, widgetInfo, cfg)).then(renderWidget).catch(() => {});
  }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<WidgetConfig>) => setCfg((c) => ({ ...c, ...patch }));
  // Anyone can open this from the home screen. With the app lock on, showing names takes the owner, and is
  // asked on picking because the preview already draws them on the home screen.
  async function pickNames(names: WidgetNames) {
    if (names === 'show' && isLockEnabled() && !(await verifyDeviceOwner(t('lock.biometricPrompt')).catch(() => false))) return;
    set({ names });
  }
  function save() {
    setWidgetConfigText(widgetInfo.widgetId, JSON.stringify(cfg));
    setResult('ok');
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title} accessibilityRole="header">{t('widgetConfig.title')}</Text>
          <Text style={styles.label}>{t('widgetConfig.content')}</Text>
          <Segmented options={[{ key: 'expiring', label: t('widgetConfig.expiring') }, { key: 'returns', label: t('widgetConfig.returns') }]} value={cfg.content} onChange={(content) => set({ content })} />
          <Text style={styles.label}>{t('widgetConfig.names')}</Text>
          <Segmented options={[{ key: 'auto', label: t('widgetConfig.namesAuto') }, { key: 'show', label: t('widgetConfig.namesShow') }, { key: 'hide', label: t('widgetConfig.namesHide') }]} value={cfg.names} onChange={(names) => void pickNames(names)} />
          <Text style={styles.hint}>{t('widgetConfig.namesHint')}</Text>
          <Group>
            <Row accessibilityRole="switch" onPress={() => set({ photos: !cfg.photos })} accessibilityState={{ checked: cfg.photos }}>
              <Text style={styles.rowText}>{t('widgetConfig.photos')}</Text>
              <Switch value={cfg.photos} onValueChange={(photos) => set({ photos })} accessibilityLabel={t('widgetConfig.photos')} />
            </Row>
            <Row separator accessibilityRole="switch" onPress={() => set({ actions: !cfg.actions })} accessibilityState={{ checked: cfg.actions }}>
              <Text style={styles.rowText}>{t('widgetConfig.actions')}</Text>
              <Switch value={cfg.actions} onValueChange={(actions) => set({ actions })} accessibilityLabel={t('widgetConfig.actions')} />
            </Row>
          </Group>
          <View style={styles.buttons}>
            <Button title={t('widgetConfig.done')} onPress={save} />
            <Button kind="glass" title={t('detail.cancel')} onPress={() => setResult('cancel')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const useStyles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12 },
  title: { ...TYPE.title2, color: colors.ink },
  label: { ...TYPE.sub, color: colors.ink2, marginTop: 8 },
  hint: { ...TYPE.foot, color: colors.ink2 },
  rowText: { flex: 1, ...TYPE.body, color: colors.ink },
  buttons: { gap: 8, marginTop: 8 },
}));
