import { Platform } from 'react-native';
import { FlexWidget, registerWidgetTaskHandler, requestWidgetUpdate, TextWidget, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { daysLabel, displayName } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listWarranties, type Db, type Warranty } from '@/db/repo.ts';
import i18n from '@/i18n';
import { isLockEnabled } from '@/lock/store';
import { getWidgetNames } from '@/settings';
import { colors } from '@/theme';
import { daysUntil, todayYmd, urgency } from '@/warranty';

// Home-screen widget (brainstorm section 13): the next warranty to expire and its days left. A tap opens
// that warranty (behind the app lock, if on). Name must match the widget in app.json.
const NAME = 'NextExpiry';

// Product names on the home screen skip the app lock, so they are hidden by default while it is on.
export const widgetShowsNames = (): boolean => getWidgetNames() ?? !isLockEnabled();

function NextExpiry({ next, active }: { next: Warranty | null; active: number }) {
  const t = i18n.t.bind(i18n);
  const days = next ? daysUntil(next.end_date, todayYmd()) : 0;
  const pill = colors[urgency(days)];
  return (
    <FlexWidget
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: colors.background, borderRadius: 16, padding: 12, justifyContent: 'center' }}
      clickAction={next ? 'OPEN_URI' : 'OPEN_APP'}
      clickActionData={next ? { uri: `warrantly://warranty/${next.id}` } : undefined}
    >
      <TextWidget text={t('widget.title')} style={{ fontSize: 12, color: colors.muted }} />
      {next ? (
        <>
          <TextWidget
            text={widgetShowsNames() ? displayName(t, next) : t('widget.hidden')}
            style={{ fontSize: 16, fontWeight: '600', color: colors.text }}
            maxLines={1}
            truncate="END"
          />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <TextWidget text={daysLabel(t, days)} style={{ fontSize: 13, fontWeight: '600', color: pill.fg, backgroundColor: pill.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }} />
            {active > 1 && <TextWidget text={`  ${t('widget.more', { count: active - 1 })}`} style={{ fontSize: 12, color: colors.muted }} />}
          </FlexWidget>
        </>
      ) : (
        <TextWidget text={t('widget.empty')} style={{ fontSize: 14, color: colors.text }} />
      )}
    </FlexWidget>
  );
}

async function render(db: Db) {
  const today = todayYmd();
  const active = (await listWarranties(db, 'complete')).filter((w) => w.end_date >= today); // sorted by expiry
  return <NextExpiry next={active[0] ?? null} active={active.length} />;
}

// Redraw after the list changes (called on every home-screen load). No-op when no widget is placed.
export async function updateWidget(db: Db): Promise<void> {
  if (Platform.OS !== 'android') return;
  const widget = await render(db);
  await requestWidgetUpdate({ widgetName: NAME, renderWidget: () => widget });
}

// Android runs this headless (without the app open) when a widget is added, resized or due for its
// periodic refresh, so the days left move on even if the app is not opened.
async function handler({ widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  renderWidget(await render(await getDb()));
}

export const registerWidget = () => registerWidgetTaskHandler(handler);
