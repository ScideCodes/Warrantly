import { Text, View } from '@/components/themeMotion';
import { useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Group } from '@/components/ui';
import { NavBar } from '@/components/Page';
import { getDb } from '@/db/client';
import { getWarranty } from '@/db/repo.ts';
import { stickerId } from '@/sticker';
import { BAR_H, colors, TYPE, themed } from '@/theme';

// Reads a Warrantly QR sticker and opens that warranty. Same camera screen as the serial scanner.
export default function ScanSticker() {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);

  const onCode = async (r: BarcodeScanningResult) => {
    if (busy.current) return;
    const id = stickerId(r.data);
    if (id === null) { setNote(t('sticker.notOurs')); return; }
    busy.current = true;
    if (await getWarranty(await getDb(), id)) router.replace(`/warranty/${id}` as Href);
    else { setNote(t('sticker.notHere')); busy.current = false; }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.body, { paddingTop: insets.top + BAR_H + 8, paddingBottom: insets.bottom + 16 }]}>
        {!permission ? null : !permission.granted ? (
          <Group style={styles.panel}>
            <Text style={styles.label}>{t('serial.needCamera')}</Text>
            {permission.canAskAgain
              ? <Button title={t('serial.allow')} onPress={() => void request()} />
              : <Button title={t('serial.openSettings')} onPress={() => void Linking.openSettings()} />}
          </Group>
        ) : (
          <>
            <View style={styles.preview}>
              <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(r) => void onCode(r)} />
            </View>
            <Text style={styles.hint} accessibilityLiveRegion="polite">{note ?? t('sticker.hint')}</Text>
          </>
        )}
      </View>
      <NavBar title={t('sticker.scan')} />
    </View>
  );
}

const useStyles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 16, gap: 12 },
  preview: { flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  hint: { ...TYPE.sub, color: colors.ink2, textAlign: 'center' },
  panel: { padding: 16, gap: 12 },
  label: { ...TYPE.body, color: colors.ink },
}));
