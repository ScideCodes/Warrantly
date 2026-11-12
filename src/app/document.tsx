import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Image, PixelRatio, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import PdfPages, { type PdfPage } from '../../modules/pdf-pages';
import { documentUri, openDocument } from '@/documents';
import { colors, BUTTON_HEIGHT, BUTTON_RADIUS } from '@/theme';

const ZOOMS = [1, 2, 3];

// In-app PDF viewer (section 18): pages drawn as images by Android's PdfRenderer. Zoom uses buttons
// instead of pinch (RN's Android ScrollView has no pinch zoom); wider pages scroll sideways.
export default function DocumentViewer() {
  const { t } = useTranslation();
  const { path, title } = useLocalSearchParams<{ path: string; title?: string }>();
  const { width } = useWindowDimensions();
  const [pages, setPages] = useState<PdfPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);

  useEffect(() => {
    // Twice the screen's pixels, so text stays sharp at 2x zoom; capped to keep each page's bitmap small.
    const px = Math.min(Math.round(PixelRatio.getPixelSizeForLayoutSize(width) * 2), 2400);
    Promise.resolve()
      .then(() => PdfPages.render(documentUri(path), px)) // documentUri throws on a name that is not a stored document
      .then(setPages)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [path, width]);

  const shown = width * ZOOMS[zoom];
  const share = () => void openDocument(path).catch((e) => setError(e instanceof Error ? e.message : String(e)));

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, title: title || t('viewer.title') }} />
      <View style={styles.bar}>
        <Pressable style={styles.button} onPress={() => setZoom((z) => z - 1)} disabled={zoom === 0} accessibilityRole="button" accessibilityLabel={t('viewer.zoomOut')}>
          <Text style={[styles.buttonText, zoom === 0 && styles.disabled]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>−</Text>
        </Pressable>
        <Text style={styles.zoom}>{ZOOMS[zoom] * 100}%</Text>
        <Pressable style={styles.button} onPress={() => setZoom((z) => z + 1)} disabled={zoom === ZOOMS.length - 1} accessibilityRole="button" accessibilityLabel={t('viewer.zoomIn')}>
          <Text style={[styles.buttonText, zoom === ZOOMS.length - 1 && styles.disabled]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>+</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.share]} onPress={share} accessibilityRole="button">
          <Text style={styles.shareText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('viewer.share')}</Text>
        </Pressable>
      </View>
      {error ? (
        <Text style={styles.error}>{t('viewer.failed', { detail: error })}</Text>
      ) : !pages ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} size="large" />
      ) : (
        <ScrollView style={styles.fill} horizontal scrollEnabled={zoom > 0}>
          <FlatList
            style={{ width: shown }}
            data={pages}
            keyExtractor={(p) => p.uri}
            renderItem={({ item, index }) => (
              <Image
                source={{ uri: item.uri }}
                style={[styles.page, { width: shown, aspectRatio: item.width / item.height }]}
                accessibilityLabel={t('viewer.page', { page: index + 1, count: pages.length })}
              />
            )}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.expired.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  button: { minWidth: BUTTON_HEIGHT, minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_RADIUS, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buttonText: { fontSize: 22, fontWeight: '700', color: colors.text },
  disabled: { color: colors.primaryDisabled },
  zoom: { minWidth: 48, textAlign: 'center', fontSize: 15, color: colors.text },
  // Shrinks and wraps to two lines on narrow screens instead of running off the edge.
  share: { marginLeft: 'auto', flexShrink: 1, paddingVertical: 4 },
  shareText: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' },
  page: { marginBottom: 8, backgroundColor: colors.background },
  fill: { flex: 1 },
  loading: { marginTop: 48 },
  error: { margin: 16, fontSize: 15, color: colors.soon.fg },
});
