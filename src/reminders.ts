import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import { listWarranties, type Db, type Warranty } from '@/db/repo.ts';
import { plannedCustomReminders } from '@/db/features.ts';
import { getReminderGroups, getReminderTime, getRemindersEnabled, getReturnRemindersEnabled } from '@/settings';
import { syncCalendar } from '@/calendarSync';
import { isLockEnabled } from '@/lock/store';
import { reminderDays, reminderPlan, returnDeadline, shortName, todayYmd } from '@/warranty';


// Show reminders that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let channelsReady = false;
async function ensureChannels() {
  if (channelsReady || Platform.OS !== 'android') return;
  // Product names stay off a locked screen: Android shows only "Warrantly" there (new channels; Android keeps
  // the visibility of a channel created by an older version).
  await Notifications.setNotificationChannelAsync('reminders', { name: i18n.t('reminder.channel'), importance: AndroidImportance.HIGH, lockscreenVisibility: AndroidNotificationVisibility.PRIVATE });
  // The expiry day is the one that must not be missed (section 16: "prominent").
  await Notifications.setNotificationChannelAsync('expiry', { name: i18n.t('reminder.channelExpiry'), importance: AndroidImportance.MAX, lockscreenVisibility: AndroidNotificationVisibility.PRIVATE });
  channelsReady = true;
}

// Replace all scheduled reminders with the nearest ones for confirmed warranties (rolling window).
// The home screen calls this on every load. Runs wait for each other (two at once would both cancel and
// then both schedule, so every reminder would arrive twice), and an unchanged plan is left alone.
let queue: Promise<void> = Promise.resolve();
let scheduled = '';
export function rescheduleReminders(db: Db): Promise<void> {
  const run = queue.then(() => reschedule(db));
  queue = run.catch(() => {});
  return run;
}

async function reschedule(db: Db): Promise<void> {
  const warranties = await listWarranties(db, 'complete');
  const byId = new Map(warranties.map((w) => [w.id, w]));
  const now = new Date();
  const returns = getReturnRemindersEnabled();
  const items = warranties.map((w) => ({ ...w, return_by: returns ? returnDeadline(w) : null }));
  // The phone calendar copy follows the same dates; a calendar error never blocks the reminders.
  void syncCalendar(items, todayYmd(now)).catch((e) => console.warn('calendar', e));
  const time = getReminderTime();
  // Custom dates (shortlist 12) are the user's own: sent even when the automatic ones are switched off.
  const custom = await plannedCustomReminders(db);
  const notes = new Map(custom.map((c) => [`${c.warranty_id}:${c.date}`, c.note]));
  const groups = getRemindersEnabled() ? reminderDays(getReminderGroups()) : [];
  const jobs = reminderPlan(items, todayYmd(now), 60, groups, custom.map((c) => ({ warrantyId: c.warranty_id, date: c.date })))
    .map((r) => {
      const [y, m, d] = r.date.split('-').map(Number);
      const w = byId.get(r.warrantyId)!;
      return {
        content: r.kind === 'return' ? returnContent(w) : r.kind === 'custom' ? customContent(w, notes.get(`${r.warrantyId}:${r.date}`) ?? null) : content(w, r.daysLeft),
        date: new Date(y, m - 1, d, Math.floor(time / 60), time % 60),
        channelId: r.kind === 'expiry' && r.daysLeft === 0 ? 'expiry' : 'reminders',
      };
    })
    .filter((j) => j.date > now); // today's reminder after its hour has already been shown
  const key = JSON.stringify(jobs);
  if (key === scheduled) return;

  scheduled = '';
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (jobs.length) {
    await ensureChannels(); // Android 13 only shows the permission prompt once a channel exists
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return;
    for (const { content, date, channelId } of jobs) {
      await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId } });
    }
  }
  scheduled = key;
}

// With the app lock on, a notification names no product (it shows over other apps and in the shade).
function content(w: Warranty, daysLeft: number): Notifications.NotificationContentInput {
  return {
    title: isLockEnabled() ? i18n.t('reminder.privateTitle') : w.product_name ? (w.origin === 'manual' || w.origin === 'scan' || w.status === 'complete' ? w.product_name : shortName(w.product_name)) : w.store_name,
    body: daysLeft === 0 ? i18n.t('reminder.today') : i18n.t('reminder.daysLeft', { count: daysLeft }),
    data: { url: `/warranty/${w.id}` },
  };
}

function customContent(w: Warranty, note: string | null): Notifications.NotificationContentInput {
  return { ...content(w, 0), body: (!isLockEnabled() && note) || i18n.t('reminder.custom') };
}

function returnContent(w: Warranty): Notifications.NotificationContentInput {
  return { ...content(w, 0), body: i18n.t('reminder.returnSoon', { count: 2 }) };
}

// shortcut: a test button on the detail screen; move it into Settings once that screen exists.
export async function sendTestReminder(w: Warranty, daysLeft: number): Promise<boolean> {
  await ensureChannels();
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: content(w, Math.max(0, daysLeft)),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: daysLeft <= 0 ? 'expiry' : 'reminders' },
  });
  return true;
}

// Tapping a reminder opens that warranty, also when the tap launched the app.
export function useReminderTaps(): void {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = last?.notification.request.content.data?.url;
    if (typeof url !== 'string' || last?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    router.push(url as Href);
    void Notifications.clearLastNotificationResponseAsync(); // so the next app open does not navigate again
  }, [last]);
}
