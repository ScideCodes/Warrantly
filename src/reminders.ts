import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import { listWarranties, type Db } from '@/db/repo.ts';
import { reminderPlan, shortName, todayYmd } from '@/warranty';

const REMINDER_HOUR = 9;

// Show reminders that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let channelsReady = false;
async function ensureChannels() {
  if (channelsReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', { name: i18n.t('reminder.channel'), importance: AndroidImportance.HIGH });
  // The expiry day is the one that must not be missed (section 16: "prominent").
  await Notifications.setNotificationChannelAsync('expiry', { name: i18n.t('reminder.channelExpiry'), importance: AndroidImportance.MAX });
  channelsReady = true;
}

// Replace all scheduled reminders with the nearest ones for confirmed warranties (rolling window).
export async function rescheduleReminders(db: Db): Promise<void> {
  const warranties = await listWarranties(db, 'complete');
  const plan = reminderPlan(warranties, todayYmd());
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!plan.length) return;
  await ensureChannels(); // Android 13 only shows the permission prompt once a channel exists
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return;

  const byId = new Map(warranties.map((w) => [w.id, w]));
  for (const r of plan) {
    const w = byId.get(r.warrantyId)!;
    const [y, m, d] = r.date.split('-').map(Number);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: w.product_name ? (w.origin === 'manual' ? w.product_name : shortName(w.product_name)) : w.store_name,
        body: r.daysLeft === 0 ? i18n.t('reminder.today') : i18n.t('reminder.daysLeft', { count: r.daysLeft }),
        data: { url: `/warranty/${w.id}` },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(y, m - 1, d, REMINDER_HOUR),
        channelId: r.daysLeft === 0 ? 'expiry' : 'reminders',
      },
    });
  }
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
