import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import PdfPages, { type PdfPage } from '../../modules/pdf-pages';
import { Text, View } from '@/components/themeMotion';
import { Page } from '@/components/Page';
import { Button, Group, Input, Switch } from '@/components/ui';
import { documentUri } from '@/documents';
import { privatePdf } from '@/privatePdf';
import { maskBetween, type Mask } from '@/redaction';
import { colors, TYPE, themed } from '@/theme';
import { withPdfText } from '@/pdfText';

export default function Redact() {
  const { path } = useLocalSearchParams<{ path: string }>();
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [index, setIndex] = useState(0);
  const [masks, setMasks] = useState<Record<number, Mask[]>>({});
  const [marking, setMarking] = useState(false);
  const [pending, setPending] = useState<Mask | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [originalPages, setOriginalPages] = useState<PdfPage[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [visited, setVisited] = useState(new Set([0]));
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(['10', '10', '50', '8']);
  const generated = useRef<string | null>(null);
  const shared = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void (async () => {
      const uri = documentUri(path);
      const info = await withPdfText(() => PdfPages.renderForText(uri, 64, 0, 1));
      if (info.pageCount < 1 || info.pageCount > 20) throw new Error(i18n.t('redact.pageLimit'));
      const rendered = await PdfPages.render(uri, 1200);
      if (active) { setPages(rendered); setOriginalPages(rendered); }
    })().catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => {
      active = false;
      mounted.current = false;
      if (generated.current && !shared.current) { const file = new File(generated.current); if (file.exists) file.delete(); }
    };
  }, [path, attempt, i18n]);
  const page = pages[index];
  const displayWidth = page ? Math.max(80, Math.min(width - 32, 680, Math.max(200, height - 430) * page.width / page.height)) : 1;
  const displayHeight = page ? displayWidth * page.height / page.width : 1;
  const add = (mask: Mask) => {
    if (mask.width > .002 && mask.height > .002) setMasks(s => ({ ...s, [index]: [...(s[index] ?? []), mask] }));
  };
  async function preview() {
    if (working.current) return;
    working.current = true; setBusy(true); setError(null); setMarking(false);
    let uri: string | null = null;
    try {
      uri = await privatePdf(originalPages, masks);
      if (!mounted.current) { const abandoned = new File(uri); if (abandoned.exists) abandoned.delete(); return; }
      const rendered = await PdfPages.render(uri, 1200);
      if (!mounted.current) { const abandoned = new File(uri); if (abandoned.exists) abandoned.delete(); return; }
      if (rendered.length !== originalPages.length) throw new Error(t('redact.pageMismatch'));
      if (generated.current) { const old = new File(generated.current); if (old.exists) old.delete(); }
      generated.current = uri; shared.current = false;
      setOutput(uri); setPages(rendered); setIndex(0); setVisited(new Set([0])); setConfirmed(false);
    } catch (e) {
      if (uri) { const failed = new File(uri); if (failed.exists) failed.delete(); }
      setError(e instanceof Error ? e.message : String(e));
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  async function share() {
    if (!output || !confirmed || visited.size !== pages.length || working.current) return;
    working.current = true; setBusy(true); setError(null);
    try { await Sharing.shareAsync(output, { mimeType: 'application/pdf', dialogTitle: t('redact.title') }); shared.current = true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { working.current = false; setBusy(false); }
  }
  const move = (next: number) => { setIndex(next); setVisited(s => new Set([...s, next])); };
  return <Page title={t(output ? 'redact.previewTitle' : 'redact.title')} lead={t(output ? 'redact.previewHint' : 'redact.hint')} scrollEnabled={!marking}
    footer={page ? <Button title={t(output ? 'redact.share' : 'redact.preview')} onPress={() => void (output ? share() : preview())} busy={busy} disabled={busy || (output ? !confirmed || visited.size !== pages.length : !Object.values(masks).some(m => m.length))} /> : undefined}>
    {!page && !error && <ActivityIndicator color={colors.ink2} />}
    {error && <><Text style={styles.error}>{error}</Text>{!page && <Button kind="glass" title={t('home.retry')} onPress={() => { setError(null); setAttempt(a => a + 1); }} />}</>}
    {page && <>
      <View style={styles.pager}><Button kind="glass" title={t('redact.previous')} disabled={index === 0 || busy} onPress={() => move(index - 1)} /><Text style={styles.count}>{index + 1} / {pages.length}</Text><Button kind="glass" title={t('redact.next')} disabled={index === pages.length - 1 || busy} onPress={() => move(index + 1)} /></View>
      {!output && <Group style={styles.toggle}><Text style={styles.flex}>{t('redact.draw')}</Text><Switch value={marking} onValueChange={setMarking} disabled={busy} accessibilityLabel={t('redact.draw')} /></Group>}
      <View style={[styles.canvas, { width: displayWidth, height: displayHeight }]} accessibilityLabel={t('redact.page', { n: index + 1 })}
        onStartShouldSetResponder={() => marking && !busy && !output}
        onMoveShouldSetResponder={() => marking && !busy && !output}
        onResponderGrant={e => { start.current = { x: e.nativeEvent.locationX / displayWidth, y: e.nativeEvent.locationY / displayHeight }; }}
        onResponderMove={e => { if (start.current) setPending(maskBetween(start.current.x, start.current.y, e.nativeEvent.locationX / displayWidth, e.nativeEvent.locationY / displayHeight)); }}
        onResponderRelease={e => { if (start.current) add(maskBetween(start.current.x, start.current.y, e.nativeEvent.locationX / displayWidth, e.nativeEvent.locationY / displayHeight)); start.current = null; setPending(null); }}
        onResponderTerminate={() => { start.current = null; setPending(null); }}>
        <Image pointerEvents="none" source={{ uri: page.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        {!output && [...(masks[index] ?? []), ...(pending ? [pending] : [])].map((mask, i) => <View pointerEvents="none" key={i} style={{ position: 'absolute', backgroundColor: '#000', left: mask.x * displayWidth, top: mask.y * displayHeight, width: mask.width * displayWidth, height: mask.height * displayHeight }} />)}
      </View>
      {output ? <>
        <Text style={styles.hint}>{t('redact.originalSafe')}</Text>
        <Group style={styles.toggle}><Text style={styles.flex}>{t('redact.confirm')}</Text><Switch value={confirmed} onValueChange={setConfirmed} disabled={busy || visited.size !== pages.length} accessibilityLabel={t('redact.confirm')} /></Group>
        <Button kind="glass" title={t('redact.edit')} disabled={busy} onPress={() => { setOutput(null); setPages(originalPages); setIndex(0); setConfirmed(false); }} />
      </> : <>
        <Button kind="glass" title={t('redact.undo')} disabled={busy || !(masks[index]?.length)} onPress={() => setMasks(s => ({ ...s, [index]: s[index].slice(0, -1) }))} />
        <Text style={styles.hint}>{t('redact.precise')}</Text>
        <View style={styles.coordinates}>{position.map((value, i) => <View key={i} style={styles.coordinate}><Text style={styles.label}>{t(`redact.coord${i}`)}</Text><Input keyboardType="decimal-pad" accessibilityLabel={t(`redact.coord${i}`)} value={value} onChangeText={v => setPosition(p => p.map((x, j) => j === i ? v : x))} editable={!busy} /></View>)}</View>
        <Button kind="glass" title={t('redact.addArea')} disabled={busy} onPress={() => {
          const [x, y, w, h] = position.map(v => Number(v.replace(',', '.')) / 100);
          if ([x, y, w, h].every(Number.isFinite) && x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1) add({ x, y, width: w, height: h });
          else setError(t('redact.invalidArea'));
        }} />
      </>}
    </>}
  </Page>;
}
const useStyles = themed(() => StyleSheet.create({
  pager: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginVertical: 12 },
  count: { ...TYPE.foot, color: colors.ink2, fontVariant: ['tabular-nums'] }, canvas: { alignSelf: 'center', backgroundColor: '#fff', marginVertical: 12 },
  toggle: { padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', marginVertical: 12 }, flex: { flex: 1, ...TYPE.body, color: colors.ink },
  hint: { ...TYPE.foot, color: colors.ink2, marginVertical: 12 }, error: { ...TYPE.sub, color: colors.bad, marginVertical: 12 },
  coordinates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, coordinate: { flexGrow: 1, flexBasis: 100, gap: 6 }, label: { ...TYPE.foot, color: colors.ink2 },
}));
