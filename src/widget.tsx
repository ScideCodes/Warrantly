import { Platform } from 'react-native';
import {
  FlexWidget, getWidgetInfo, ImageWidget, registerWidgetTaskHandler, requestWidgetUpdate, TextWidget,
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
import { namesShown, parseWidgetConfig, ROWS, widgetRows, widgetSize, type WidgetConfig, type WidgetRow } from '@/widgetModel';

// Home-screen widget (section 13, shortlist 23–30). Each placed widget has its own settings (what it shows,
// names, photos, quick actions), chosen when it is added and changeable later. It grows with its size: one
// item when small, a short list when larger, and quick actions (scan, add, search) when there is room. The
// count of items needing attention sits in the corner. Colours follow the app's appearance: Light, Dark, or
// System (then Android picks the matching variant itself). Name must match the widget in app.json.
export const NAME = 'NextExpiry';

type Hex = `#${string}`;
type Pill = { fg: Hex; bg: Hex };
interface WidgetPalette { card: Hex; ink: Hex; ink2: Hex; line: Hex; action: Hex; actionInk: Hex; badge: Pill; ok: Pill; warning: Pill; soon: Pill; expired: Pill }
const LIGHT: WidgetPalette = {
  card: '#FFFFFF', ink: '#0E1116', ink2: '#5B6270', line: '#E5E7EB', action: '#EEF2FF', actionInk: '#1D4ED8', badge: { fg: '#FFFFFF', bg: '#C2410C' },
  ok: { fg: '#166534', bg: '#DCFCE7' }, warning: { fg: '#92400E', bg: '#FEF3C7' }, soon: { fg: '#C2410C', bg: '#FFEDD5' }, expired: { fg: '#374151', bg: '#F3F4F6' },
};
const DARK: WidgetPalette = {
  card: '#1C1C1E', ink: '#F2F2F7', ink2: '#A1A1AA', line: '#38383A', action: '#1E293B', actionInk: '#93C5FD', badge: { fg: '#1C1C1E', bg: '#FDBA74' },
  ok: { fg: '#86EFAC', bg: '#14532D' }, warning: { fg: '#FCD34D', bg: '#451A03' }, soon: { fg: '#FDBA74', bg: '#431407' }, expired: { fg: '#D1D5DB', bg: '#374151' },
};

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

function Action({ label, uri, c }: { label: string; uri: string; c: WidgetPalette }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }} style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: c.action, alignItems: 'center', justifyContent: 'center', marginHorizontal: 3 }}>
      <TextWidget text={label} style={{ fontSize: 13, fontWeight: '600', color: c.actionInk }} maxLines={1} truncate="END" />
    </FlexWidget>
  );
}

function Body({ data, cfg, size, c }: { data: Data; cfg: WidgetConfig; size: ReturnType<typeof widgetSize>; c: WidgetPalette }) {
  const t = i18n.t.bind(i18n);
  const returns = cfg.content === 'returns';
  const title = t(returns ? 'widget.titleReturns' : 'widget.title');
  const rowLabel = (r: WidgetRow) => r.title ?? t(returns ? 'widget.hiddenReturn' : 'widget.hidden');
  return (
    <FlexWidget
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.card, borderRadius: 16, padding: 12, flexDirection: 'column', justifyContent: size === 'small' ? 'center' : 'flex-start' }}
      clickAction="OPEN_APP"
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget text={title} style={{ fontSize: 12, color: c.ink2 }} maxLines={1} truncate="END" />
        </FlexWidget>
        {data.attention > 0 ? (
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'warrantly://attention' }} style={{ backgroundColor: c.badge.bg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 }}>
            <TextWidget text={t('widget.attention', { count: data.attention })} style={{ fontSize: 12, fontWeight: '600', color: c.badge.fg }} maxLines={1} />
          </FlexWidget>
        ) : null}
      </FlexWidget>
      {data.rows.length === 0 ? (
        <TextWidget text={t(returns ? 'widget.emptyReturns' : 'widget.empty')} style={{ fontSize: 14, color: c.ink, marginTop: 6 }} />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 4 }}>
          {data.rows.map((r, i) => {
            const pill = c[urgency(r.days)];
            const photo = data.photos.get(r.id);
            return (
              <FlexWidget key={r.id} clickAction="OPEN_URI" clickActionData={{ uri: `warrantly://warranty/${r.id}` }}
                style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', paddingVertical: 4, borderTopWidth: i > 0 ? 1 : 0, borderColor: c.line }}>
                {photo ? <ImageWidget image={photo as `data:image${string}`} imageWidth={32} imageHeight={32} radius={8} style={{ marginRight: 8 }} /> : null}
                <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
                  <TextWidget text={rowLabel(r)} style={{ fontSize: size === 'small' ? 16 : 14, fontWeight: '600', color: c.ink }} maxLines={1} truncate="END" />
                  <FlexWidget style={{ flexDirection: 'row', marginTop: 2 }}>
                    <TextWidget text={returns ? t('widget.returnIn', { count: r.days }) : daysLabel(t, r.days)}
                      style={{ fontSize: 12, fontWeight: '600', color: pill.fg, backgroundColor: pill.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 }} />
                  </FlexWidget>
                </FlexWidget>
              </FlexWidget>
            );
          })}
          {data.active > data.rows.length && !returns
            ? <TextWidget text={t('widget.more', { count: data.active - data.rows.length })} style={{ fontSize: 12, color: c.ink2, marginTop: 2 }} /> : null}
        </FlexWidget>
      )}
      {cfg.actions && size !== 'small' ? (
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', marginTop: 8 }}>
          <Action label={t('widget.scan')} uri="warrantly://warranty/edit?scan=1" c={c} />
          <Action label={t('widget.add')} uri="warrantly://warranty/edit" c={c} />
          {size === 'large' ? <Action label={t('widget.search')} uri="warrantly://?search=1" c={c} /> : null}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

// Light, Dark, or both for System (Android then follows the phone).
export async function renderFor(db: Db, info: Pick<WidgetInfo, 'widgetId' | 'width' | 'height' | 'screenInfo'>, cfg = widgetConfig(info.widgetId)): Promise<WidgetRepresentation> {
  const size = widgetSize(info.width, info.height, info.screenInfo?.fontScale ?? 1);
  const rows = cfg.actions && size !== 'small' ? ROWS[size] : ROWS[size] + (size === 'small' ? 0 : 1);
  const data = await load(db, cfg, rows);
  const theme = getThemeSetting();
  if (theme === 'light') return <Body data={data} cfg={cfg} size={size} c={LIGHT} />;
  if (theme === 'dark') return <Body data={data} cfg={cfg} size={size} c={DARK} />;
  return { light: <Body data={data} cfg={cfg} size={size} c={LIGHT} />, dark: <Body data={data} cfg={cfg} size={size} c={DARK} /> };
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
