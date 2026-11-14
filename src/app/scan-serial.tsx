import { Text, View } from '@/components/themeMotion';
import { useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { extractTextFromImage } from 'expo-text-extractor';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Group, Input, Row } from '@/components/ui';
import { NavBar } from '@/components/Page';
import { goBack } from '@/nav';
import { putScannedSerial, serialCandidates, serialFromBarcode } from '@/serial';
import { BAR_H, colors, TYPE, themed } from '@/theme';

// Serial number scanner (shortlist 11): a barcode on the label is read live; without one, a photo of the
// label is read as text and the likely serial numbers are offered. The value is always shown to confirm or
// correct before it goes into the form; typing it is always possible.
export default function ScanSerial() {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [value, setValue] = useState<string | null>(null); // null: still looking
  const [candidates, setCandidates] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const onBarcode = (r: BarcodeScanningResult) => {
    if (value !== null) return;
    const v = serialFromBarcode(r.data);
    if (v) setValue(v);
  };
  async function readText() {
    if (!camera.current || reading) return;
    setReading(true);
    setNote(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8 });
      const found = serialCandidates(await extractTextFromImage(photo.uri));
      if (!found.length) setNote(t('serial.noneFound'));
      else { setCandidates(found); setValue(found[0]); }
    } catch (e) {
      setNote(t('serial.readFailed', { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      setReading(false);
    }
  }
  function use() {
    if (!value?.trim()) return;
    putScannedSerial(value.trim().toUpperCase());
    goBack();
  }

  const confirm = value !== null && (
    <Group style={styles.panel}>
      <Text style={styles.label}>{t('serial.confirm')}</Text>
      <Input value={value} onChangeText={setValue} autoCapitalize="characters" autoCorrect={false} accessibilityLabel={t('form.serial')} maxLength={40} />
      {candidates.length > 1 && candidates.map((c, i) => (
        <Row key={c} separator={i > 0} onPress={() => setValue(c)} selected={c === value} accessibilityRole="radio" accessibilityState={{ selected: c === value }}>
          <Text style={styles.code}>{c}</Text>
        </Row>
      ))}
      <Button title={t('serial.use')} onPress={use} disabled={!value.trim()} />
      <Button kind="glass" title={t('serial.again')} onPress={() => { setValue(null); setCandidates([]); }} />
    </Group>
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.body, { paddingTop: insets.top + BAR_H + 8, paddingBottom: insets.bottom + 16 }]}>
        {value !== null ? confirm : !permission ? null : !permission.granted ? (
          <Group style={styles.panel}>
            <Text style={styles.label}>{t('serial.needCamera')}</Text>
            {permission.canAskAgain
              ? <Button title={t('serial.allow')} onPress={() => void request()} />
              : <Button title={t('serial.openSettings')} onPress={() => void Linking.openSettings()} />}
            <Button kind="glass" title={t('serial.type')} onPress={() => setValue('')} />
          </Group>
        ) : (
          <>
            <View style={styles.preview}>
              <CameraView
                ref={camera}
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'qr', 'datamatrix'] }}
                onBarcodeScanned={onBarcode}
              />
            </View>
            <Text style={styles.hint} accessibilityLiveRegion="polite">{note ?? t('serial.hint')}</Text>
            <Button title={t('serial.readText')} icon="text-outline" onPress={() => void readText()} busy={reading} />
            <Button kind="glass" title={t('serial.type')} onPress={() => setValue('')} />
          </>
        )}
      </View>
      <NavBar title={t('serial.title')} />
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
  code: { flex: 1, ...TYPE.body, color: colors.ink, fontVariant: ['tabular-nums'] },
}));
