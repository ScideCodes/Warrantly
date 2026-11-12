import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Image, PixelRatio, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import PdfPages, { type PdfPage } from '../../modules/pdf-pages';
import { documentUri, openDocument, saveDocument } from '@/documents';
import { colors, BUTTON_HEIGHT, BUTTON_RADIUS, SPACE } from '@/theme';

const ZOOMS = [1, 2, 3];
type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; detail: string };

// In-app PDF viewer (section 18): pages drawn as images by Android's PdfRenderer. Zoom uses buttons
// instead of pinch (RN's Android ScrollView has no pinch zoom); wider pages scroll sideways.
// Save puts a copy in a folder the person picks; Share hands the file to another app.
export default function DocumentViewer() {
  const { t } = useTranslation();
  const { path, title, name } = useLocalSearchParams<{ path: string; title?: string; name?: string }>();
  const { width } = useWindowDimensions();
  const [pages, setPages] = useState<PdfPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    // Twice the screen's pixels, so text stays sharp at 2x zoom; capped to keep each page's bitmap small.
    const px = Math.min(Math.round(PixelRatio.getPixelSizeForLayoutSize(width) * 2), 2400);
    Promise.resolve()
      .then(() => PdfPages.render(documentUri(path), px)) // documentUri throws on a name that is not a stored document
      .then(setPages)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [path, width]);

  const shown = width * ZOOMS[zoom];
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const share = () => void openDocument(path).catch((e) => setStatus({ kind: 'error', detail: message(e) }));
  async function save() {
    setStatus({ kind: 'saving' });
    try {
      // false: the folder picker was closed, so nothing was saved and nothing went wrong.
      setStatus((await saveDocument(path, name || `${title || 'document'}.pdf`)) ? { kind: 'saved' } : { kind: 'idle' });
    } catch (e) {
      setStatus({ kind: 'error', detail: message(e) });
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, title: title || t('viewer.title') }} />
      <View style={styles.zoomBar}>
        <Pressable style={styles.zoomButton} onPress={() => setZoom((z) => z - 1)} disabled={zoom === 0} accessibilityRole="button" accessibilityLabel={t('viewer.zoomOut')}>
          <Ionicons name="remove" size={24} color={zoom === 0 ? colors.primaryDisabled : colors.text} />
        </Pressable>
        <Text style={styles.zoom}>{ZOOMS[zoom] * 100}%</Text>
        <Pressable style={styles.zoomButton} onPress={() => setZoom((z) => z + 1)} disabled={zoom === ZOOMS.length - 1} accessibilityRole="button" accessibilityLabel={t('viewer.zoomIn')}>
          <Ionicons name="add" size={24} color={zoom === ZOOMS.length - 1 ? colors.primaryDisabled : colors.text} />
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
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.actions}>
        {status.kind !== 'idle' && (
          <Text style={[styles.status, status.kind === 'error' && styles.statusError]} accessibilityLiveRegion="polite">
            {status.kind === 'saving' ? t('viewer.saving') : status.kind === 'saved' ? t('viewer.saved') : t('detail.saveFailed', { detail: status.detail })}
          </Text>
        )}
        <View style={styles.actionRow}>
          <Pressable style={[styles.action, styles.primary]} onPress={save} disabled={status.kind === 'saving'} accessibilityRole="button">
            <Ionicons name="download-outline" size={22} color={colors.onPrimary} />
            <Text style={styles.primaryText}>{t('detail.save')}</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={share} accessibilityRole="button">
            <Ionicons name="share-social-outline" size={22} color={colors.primary} />
            <Text style={styles.actionText}>{t('viewer.shareShort')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.expired.bg },
  zoomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4, backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  zoomButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  zoom: { minWidth: 56, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
  page: { marginBottom: 8, backgroundColor: colors.background },
  fill: { flex: 1 },
  loading: { marginTop: 48 },
  error: { margin: 16, fontSize: 16, color: colors.soon.fg },
  actions: { paddingHorizontal: SPACE.group, paddingTop: 10, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  status: { fontSize: 15, color: colors.text, textAlign: 'center', paddingBottom: 8 },
  statusError: { color: colors.soon.fg },
  actionRow: { flexDirection: 'row', gap: 10, paddingBottom: 10 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: BUTTON_HEIGHT, paddingHorizontal: 12, borderRadius: BUTTON_RADIUS, backgroundColor: colors.primarySoft },
  primary: { backgroundColor: colors.primary },
  primaryText: { fontSize: 17, fontWeight: '700', color: colors.onPrimary },
  actionText: { fontSize: 17, fontWeight: '700', color: colors.primary },
});
