import { useEffect, useRef, useState } from 'react';
import AppIcon from '@/components/Icon';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Image, PixelRatio, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import PdfPages, { type PdfPage } from '../../modules/pdf-pages';
import { documentUri, openDocument, saveDocument } from '@/documents';
import { NavBar } from '@/components/Page';
import { Button, type IconName } from '@/components/ui';
import { BAR_H, colors, gutter, isDark, TYPE } from '@/theme';

const ZOOMS = [1, 2, 3];
type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'sharing' } | { kind: 'saved' } | { kind: 'error'; action: 'save' | 'share'; detail: string };

// In-app PDF viewer (section 18): pages drawn as images by Android's PdfRenderer. Zoom uses buttons
// instead of pinch (RN's Android ScrollView has no pinch zoom); wider pages scroll sideways.
// Save puts a copy in a folder the person picks; Share hands the file to another app.
export default function DocumentViewer() {
  const { t } = useTranslation();
  const { path, title, name } = useLocalSearchParams<{ path: string; title?: string; name?: string }>();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const width = Math.min(windowWidth, 720);
  const stackActions = width / fontScale < 360;
  const insets = useSafeAreaInsets();
  const [pages, setPages] = useState<PdfPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const working = useRef(false);
  const busy = status.kind === 'saving' || status.kind === 'sharing';

  useEffect(() => {
    let active = true;
    // Twice the screen's pixels, so text stays sharp at 2x zoom; capped to keep each page's bitmap small.
    const px = Math.min(Math.round(PixelRatio.getPixelSizeForLayoutSize(width) * 2), 2400);
    Promise.resolve()
      .then(() => {
        if (active) { setPages(null); setError(null); }
        return PdfPages.render(documentUri(path), px); // rejects names outside stored documents
      })
      .then((value) => { if (active) setPages(value); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, [path, width]);

  const shown = width * ZOOMS[zoom];
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
  async function share() {
    if (working.current) return;
    working.current = true;
    setStatus({ kind: 'sharing' });
    try {
      await openDocument(path);
      setStatus({ kind: 'idle' });
    } catch (e) {
      setStatus({ kind: 'error', action: 'share', detail: message(e) });
    } finally {
      working.current = false;
    }
  }
  async function save() {
    if (working.current) return;
    working.current = true;
    setStatus({ kind: 'saving' });
    try {
      // false: the folder picker was closed, so nothing was saved and nothing went wrong.
      setStatus((await saveDocument(path, name || `${title || 'document'}.pdf`)) ? { kind: 'saved' } : { kind: 'idle' });
    } catch (e) {
      setStatus({ kind: 'error', action: 'save', detail: message(e) });
    } finally {
      working.current = false;
    }
  }

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top + BAR_H }} />
      {/* Zoom out, the level and zoom in share one capsule (the reference's `.pc-tools`). */}
      <View style={styles.tools}>
        <View style={styles.capsule}>
          <ToolButton icon="remove" label={t('viewer.zoomOut')} onPress={() => setZoom((z) => z - 1)} disabled={zoom === 0} />
          <Text style={styles.zoom}>{ZOOMS[zoom] * 100}%</Text>
          <ToolButton icon="add" label={t('viewer.zoomIn')} onPress={() => setZoom((z) => z + 1)} disabled={zoom === ZOOMS.length - 1} />
        </View>
      </View>
      {error ? (
        <View style={styles.fill}>
          <Text style={styles.error}>{t('viewer.failed', { detail: error })}</Text>
        </View>
      ) : !pages ? (
        <ActivityIndicator style={styles.loading} color={colors.tint} size="large" />
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
      <View style={[styles.actions, { paddingBottom: insets.bottom + 12, paddingHorizontal: gutter(windowWidth) }]}>
        {status.kind !== 'idle' && (
          <Text style={[styles.status, status.kind === 'error' && styles.statusError]} accessibilityLiveRegion="polite">
            {status.kind === 'saving' ? t('viewer.saving') : status.kind === 'sharing' ? t('viewer.sharing') : status.kind === 'saved' ? t('viewer.saved') : t(status.action === 'save' ? 'detail.saveFailed' : 'detail.shareFailed', { detail: status.detail })}
          </Text>
        )}
        <View style={[styles.actionRow, stackActions && styles.stacked]}>
          <Button title={t('detail.save')} icon="download-outline" onPress={save} disabled={busy} busy={status.kind === 'saving'} style={!stackActions && styles.action} />
          <Button kind="glass" title={t('viewer.shareShort')} icon="share-social-outline" onPress={share} disabled={busy} busy={status.kind === 'sharing'} style={!stackActions && styles.action} />
        </View>
      </View>
      <NavBar title={title || t('viewer.title')} />
    </View>
  );
}

// A round 44dp tool in the capsule: label colour, presses to .94 on --press.
function ToolButton({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.round, pressed && styles.roundPressed, disabled && styles.roundDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <AppIcon name={icon} size={20} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tools: { alignItems: 'center', paddingBottom: 14, paddingHorizontal: 16 },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 28,
    backgroundColor: isDark ? colors.card2 : colors.card,
    boxShadow: isDark ? undefined : 'inset 0 0 0 0.5px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.06)',
  },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  roundPressed: { backgroundColor: colors.press, transform: [{ scale: 0.94 }] },
  roundDisabled: { opacity: 0.35 },
  zoom: { minWidth: 56, paddingHorizontal: 8, textAlign: 'center', ...TYPE.sub, fontWeight: '600', color: colors.ink },
  page: { marginBottom: 8, backgroundColor: '#fff' },
  fill: { flex: 1 },
  loading: { flex: 1 },
  error: { margin: 16, ...TYPE.body, color: colors.bad },
  actions: { paddingTop: 12, backgroundColor: colors.bg },
  status: { ...TYPE.foot, color: colors.ink, textAlign: 'center', paddingBottom: 8 },
  statusError: { color: colors.bad },
  actionRow: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minWidth: 0 },
  stacked: { flexDirection: 'column' },
});
