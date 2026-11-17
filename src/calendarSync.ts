import Storage from 'expo-sqlite/kv-store';
import * as Calendar from 'expo-calendar';
import i18n from '@/i18n';
import { calendarPlan } from '@/warranty';

// Settings > Calendar: warranty ends and return deadlines as all-day events in a "Warrantly" calendar on the
// phone, a second reminder that does not depend on the app. The calendar is the app's own: it is rebuilt from
// the warranties whenever they change, and removed when the switch goes off.

type Item = Parameters<typeof calendarPlan>[0][number];

const KEY_ON = 'calendar_sync';
const KEY_ID = 'calendar_id';
const KEY_PLAN = 'calendar_plan';

export const getCalendarSync = (): boolean => Storage.getItemSync(KEY_ON) === '1';

async function ownCalendar(create: boolean): Promise<Calendar.ExpoCalendar | null> {
  const id = Storage.getItemSync(KEY_ID);
  const all = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const found = all.find((c) => c.id === id);
  if (found || !create) return found ?? null;
  const source = { isLocalAccount: true, name: 'Warrantly', type: Calendar.SourceType.LOCAL };
  const made = await Calendar.createCalendar({
    title: 'Warrantly', name: 'warrantly', color: '#0A84FF', entityType: Calendar.EntityTypes.EVENT,
    source, ownerAccount: 'Warrantly', accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  Storage.setItemSync(KEY_ID, made.id);
  Storage.removeItemSync(KEY_PLAN);
  return made;
}

// All-day events are kept in UTC on Android: midnight to the next midnight of that date.
const utcDay = (ymd: string, add = 0) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + add));
};

let queue: Promise<void> = Promise.resolve();
export function syncCalendar(items: readonly Item[], today: string): Promise<void> {
  const run = queue.then(() => sync(items, today));
  queue = run.catch(() => {});
  return run;
}

async function sync(items: readonly Item[], today: string): Promise<void> {
  if (!getCalendarSync()) return;
  if ((await Calendar.getCalendarPermissions()).status !== 'granted') return;
  const plan = calendarPlan(items, today, (k, o) => i18n.t(k, o));
  const sig = JSON.stringify(plan);
  const calendar = await ownCalendar(true);
  if (!calendar || Storage.getItemSync(KEY_PLAN) === sig) return; // unchanged: nothing to rewrite
  // Rebuild: the calendar is ours alone, so clearing it cannot touch the person's own events.
  const old = await calendar.listEvents(utcDay(today, -400), utcDay(today, 365 * 40));
  for (const e of old) await e.delete();
  for (const e of plan) {
    await calendar.createEvent({ title: e.title, startDate: utcDay(e.date), endDate: utcDay(e.date, 1), allDay: true, timeZone: 'UTC' });
  }
  Storage.setItemSync(KEY_PLAN, sig);
}

// Turning it on asks for calendar access; false when the person refused.
export async function enableCalendarSync(): Promise<boolean> {
  if ((await Calendar.requestCalendarPermissions()).status !== 'granted') return false;
  Storage.setItemSync(KEY_ON, '1');
  Storage.removeItemSync(KEY_PLAN);
  return true;
}

export async function disableCalendarSync(): Promise<void> {
  Storage.setItemSync(KEY_ON, '0');
  Storage.removeItemSync(KEY_PLAN);
  const calendar = await ownCalendar(false).catch(() => null);
  if (calendar) await calendar.delete();
  Storage.removeItemSync(KEY_ID);
}
