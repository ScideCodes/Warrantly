import { Platform } from 'react-native';
import {
  FlexWidget, getWidgetInfo, ImageWidget, registerWidgetTaskHandler, requestWidgetUpdate, SvgWidget, TextWidget,
  type WidgetInfo, type WidgetRepresentation, type WidgetTaskHandlerProps,
} from 'react-native-android-widget';
import { daysLabel } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listReturnPrompts, listWarranties, type Db, type Warranty } from '@/db/repo.ts';
import { photoForWidget } from '@/documents';
import i18n from '@/i18n';
import { isLockEnabled } from '@/lock/store';
import { getThemeSetting, getWidgetConfigText, getWidgetNames, removeWidgetConfig } from '@/settings';
import { todayYmd, urgency } from '@/warranty';
import { namesShown, PAD, parseWidgetConfig, widgetLayout, widgetRows, type WidgetConfig, type WidgetRow } from '@/widgetModel';

// Home-screen widget (section 13, shortlist 23–30). Each placed widget has its own settings (what it shows,
// names, photos, quick actions), chosen when it is added and changeable later. It grows with its size: one
// item when small, a short list when larger, and quick actions (scan, add, search) when there is room. The
// count of items needing attention sits in the corner. Colours follow the app's appearance: Light, Dark, or
// System (then Android picks the matching variant itself). Name must match the widget in app.json.
export const NAME = 'NextExpiry';

type Hex = `#${string}`;
type Color = Hex | `rgba(${number}, ${number}, ${number}, ${number})`;
type Pill = { fg: Hex; bg: Color };
// iOS 27 glass on a home screen: Android widgets cannot blur, so the card is a frosted, see-through
// gradient with a bright hairline edge, and the buttons are smaller glass discs on it.
interface WidgetPalette { from: Color; to: Color; edge: Color; ink: Hex; ink2: Hex; line: Color; disc: Color; discEdge: Color; tint: Hex; badge: Pill; ok: Pill; warning: Pill; soon: Pill; expired: Pill }
const LIGHT: WidgetPalette = {
  from: 'rgba(255, 255, 255, 0.92)', to: 'rgba(240, 243, 248, 0.78)', edge: 'rgba(255, 255, 255, 0.95)',
  ink: '#0B0D12', ink2: '#6B7280', line: 'rgba(15, 23, 42, 0.08)', disc: 'rgba(255, 255, 255, 0.85)', discEdge: 'rgba(15, 23, 42, 0.08)', tint: '#0A84FF',
  badge: { fg: '#FFFFFF', bg: '#FF6B00' },
  ok: { fg: '#15803D', bg: 'rgba(34, 197, 94, 0.16)' }, warning: { fg: '#B45309', bg: 'rgba(245, 158, 11, 0.18)' },
  soon: { fg: '#C2410C', bg: 'rgba(249, 115, 22, 0.18)' }, expired: { fg: '#4B5563', bg: 'rgba(107, 114, 128, 0.16)' },
};
const DARK: WidgetPalette = {
  from: 'rgba(48, 48, 52, 0.88)', to: 'rgba(24, 24, 27, 0.78)', edge: 'rgba(255, 255, 255, 0.16)',
  ink: '#F5F5F7', ink2: '#A1A1AA', line: 'rgba(255, 255, 255, 0.1)', disc: 'rgba(255, 255, 255, 0.12)', discEdge: 'rgba(255, 255, 255, 0.14)', tint: '#64A8FF',
  badge: { fg: '#1C1C1E', bg: '#FFA94D' },
  ok: { fg: '#86EFAC', bg: 'rgba(34, 197, 94, 0.22)' }, warning: { fg: '#FCD34D', bg: 'rgba(245, 158, 11, 0.24)' },
  soon: { fg: '#FDBA74', bg: 'rgba(249, 115, 22, 0.24)' }, expired: { fg: '#D1D5DB', bg: 'rgba(161, 161, 170, 0.2)' },
};

// Outline icons drawn in the tint colour (scan, add, search).
const ICON = {
  scan: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10',
  add: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
};
const icon = (d: string, color: Hex) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Product names on the home screen skip the app lock, so they are hidden by default while it is on.
export const widgetShowsNames = (): boolean => getWidgetNames() ?? !isLockEnabled();
export const widgetConfig = (id: number): WidgetConfig => parseWidgetConfig(getWidgetConfigText(id));

interface Data { rows: WidgetRow[]; photos: Map<number, string>; attention: number; active: number }

async function load(db: Db, cfg: WidgetConfig, max: number): Promise<Data> {
  const today = todayYmd();
  const [complete, needsInput, returns] = await Promise.all([listWarranties(db, 'complete'), listWarranties(db, 'needs_input'), listReturnPrompts(db)]);
  const rows = widgetRows(complete, cfg, namesShown(cfg, widgetShowsNames()), today, max);
  const photos = new Map<number, string>();
  for (const r of rows) {
    if (!r.photo) continue;
    const uri = await photoForWidget(r.photo, 96);
    if (uri) photos.set(r.id, uri);
  }
  return { rows, photos, attention: needsInput.length + returns.length, active: complete.filter((w: Warranty) => w.end_date >= today).length };
}

function Action({ label, uri, path, c }: { label: string; uri: string; path: string; c: WidgetPalette }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }} accessibilityLabel={label}
      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.disc, borderWidth: 1, borderColor: c.discEdge, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
      <SvgWidget svg={icon(path, c.tint)} style={{ width: 18, height: 18 }} />
    </FlexWidget>
  );
}

function Body({ data, cfg, layout, c }: { data: Data; cfg: WidgetConfig; layout: ReturnType<typeof widgetLayout>; c: WidgetPalette }) {
  const t = i18n.t.bind(i18n);
  const returns = cfg.content === 'returns';
  const title = t(returns ? 'widget.titleReturns' : 'widget.title');
  const rowLabel = (r: WidgetRow) => r.title ?? t(returns ? 'widget.hiddenReturn' : 'widget.hidden');
  const spoken = (r: WidgetRow) => `${rowLabel(r)}, ${returns ? t('widget.returnIn', { count: r.days }) : daysLabel(t, r.days)}`;
  const days = (r: WidgetRow) => t(r.days === 0 ? 'warranty.counterToday' : 'warranty.counterDays', { count: r.days });
  const first = data.rows[0];
  return (
    <FlexWidget
      style={{
        height: 'match_parent', width: 'match_parent', borderRadius: 24, padding: PAD, flexDirection: 'column',
        backgroundGradient: { from: c.from, to: c.to, orientation: 'TL_BR' }, borderWidth: 1, borderColor: c.edge,
        justifyContent: layout.header ? 'flex-start' : 'center',
      }}
      clickAction="OPEN_APP"
    >
      {layout.header && <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginBottom: 6 }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget text={title} style={{ fontSize: 13, fontWeight: '600', color: c.ink2 }} maxLines={1} truncate="END" />
          {data.attention > 0 ? (
            <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'warrantly://attention' }} style={{ backgroundColor: c.badge.bg, borderRadius: 9, paddingHorizontal: 6, marginLeft: 6 }}>
              <TextWidget text={String(data.attention)} accessibilityLabel={t('widget.attention', { count: data.attention })} style={{ fontSize: 11, fontWeight: '700', color: c.badge.fg }} maxLines={1} />
            </FlexWidget>
          ) : null}
        </FlexWidget>
        {layout.actions > 0 ? <Action label={t('widget.scan')} uri="warrantly://warranty/edit?scan=1" path={ICON.scan} c={c} /> : null}
        {layout.actions > 0 ? <Action label={t('widget.add')} uri="warrantly://warranty/edit" path={ICON.add} c={c} /> : null}
        {layout.actions === 3 ? <Action label={t('widget.search')} uri="warrantly://?search=1" path={ICON.search} c={c} /> : null}
      </FlexWidget>}
      {!first ? (
        <TextWidget text={t(returns ? 'widget.emptyReturns' : 'widget.empty')} style={{ fontSize: 15, fontWeight: '600', color: c.ink }} maxLines={2} truncate="END" />
      ) : layout.hero ? (
        // One item with room to spare: the name over a big day count, like an iOS small widget.
        <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: `warrantly://warranty/${first.id}` }} accessibilityLabel={spoken(first)}
          style={{ flexDirection: 'column', width: 'match_parent' }}>
          <TextWidget text={rowLabel(first)} style={{ fontSize: 15, fontWeight: '600', color: c.ink }} maxLines={1} truncate="END" />
          <TextWidget text={days(first)} style={{ fontSize: 30, fontWeight: '700', color: c[urgency(first.days)].fg, marginTop: 4 }} maxLines={1} truncate="END" />
          {layout.more && data.active > 1 && !returns
            ? <TextWidget text={t('widget.more', { count: data.active - 1 })} style={{ fontSize: 12, color: c.ink2, marginTop: 4 }} maxLines={1} /> : null}
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          {data.rows.map((r, i) => {
            const pill = c[urgency(r.days)];
            const photo = data.photos.get(r.id);
            return (
              <FlexWidget key={r.id} clickAction="OPEN_URI" clickActionData={{ uri: `warrantly://warranty/${r.id}` }} accessibilityLabel={spoken(r)}
                style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderColor: c.line }}>
                {photo ? <ImageWidget image={photo as `data:image${string}`} imageWidth={22} imageHeight={22} radius={6} style={{ marginRight: 8 }} /> : null}
                <FlexWidget style={{ flex: 1, marginRight: 8 }}>
                  <TextWidget text={rowLabel(r)} style={{ fontSize: 15, fontWeight: '600', color: c.ink }} maxLines={1} truncate="END" />
                </FlexWidget>
                <TextWidget text={days(r)} maxLines={1}
                  style={{ fontSize: 12, fontWeight: '700', color: pill.fg, backgroundColor: pill.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }} />
              </FlexWidget>
            );
          })}
          {layout.more && data.active > data.rows.length && !returns
            ? <TextWidget text={t('widget.more', { count: data.active - data.rows.length })} style={{ fontSize: 12, color: c.ink2, marginTop: 4 }} maxLines={1} /> : null}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

// Light, Dark, or both for System (Android then follows the phone).
export async function renderFor(db: Db, info: Pick<WidgetInfo, 'widgetId' | 'width' | 'height' | 'screenInfo'>, cfg = widgetConfig(info.widgetId)): Promise<WidgetRepresentation> {
  const layout = widgetLayout(info.width, info.height, info.screenInfo?.fontScale ?? 1, cfg.actions);
  const data = await load(db, cfg, layout.rows);
  const theme = getThemeSetting();
  if (theme === 'light') return <Body data={data} cfg={cfg} layout={layout} c={LIGHT} />;
  if (theme === 'dark') return <Body data={data} cfg={cfg} layout={layout} c={DARK} />;
  return { light: <Body data={data} cfg={cfg} layout={layout} c={LIGHT} />, dark: <Body data={data} cfg={cfg} layout={layout} c={DARK} /> };
}

// Redraw every placed widget after the list changes (home loads, edits, theme change). No-op when none.
export async function updateWidget(db: Db): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!(await getWidgetInfo(NAME)).length) return;
  await requestWidgetUpdate({ widgetName: NAME, renderWidget: (info) => renderFor(db, info) });
}

// Android runs this headless (without the app open) when a widget is added, resized or due for its
// periodic refresh, so the days left move on even if the app is not opened.
async function handler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED') return removeWidgetConfig(widgetInfo.widgetId);
  if (widgetAction === 'WIDGET_CLICK') return;
  renderWidget(await renderFor(await getDb(), widgetInfo));
}

export const registerWidget = () => registerWidgetTaskHandler(handler);
